// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title GovernanceSpace
 * @dev A self-contained governance contract for a single community/DAO.
 *      Supports simple majority 1-person-1-vote with configurable quorum and duration.
 */
contract GovernanceSpace {
    // ── Enums ────────────────────────────────────────────────────────────────

    enum VoteOption { NONE, FOR, AGAINST, ABSTAIN }
    enum ProposalStatus { ACTIVE, PASSED, REJECTED, EXPIRED }

    // ── Structs ──────────────────────────────────────────────────────────────

    struct Proposal {
        uint256 id;
        address proposer;
        string metadataURI;   // IPFS hash or off-chain DB pointer (e.g. "db:uuid")
        uint256 startTime;
        uint256 endTime;
        uint256 forVotes;
        uint256 againstVotes;
        uint256 abstainVotes;
        ProposalStatus status;
        bool closed;
    }

    // ── State ────────────────────────────────────────────────────────────────

    address public owner;
    string  public communityId;      // off-chain UUID for easy indexing
    uint256 public quorumPercent;    // e.g. 20 = 20%
    uint256 public voteDurationSecs; // default voting window

    uint256 private _proposalCount;
    mapping(uint256 => Proposal) public proposals;
    // proposalId => voter => VoteOption
    mapping(uint256 => mapping(address => VoteOption)) public votes;

    // Simple member list (wallet-based membership)
    mapping(address => bool) public members;
    mapping(address => bool) public admins;
    uint256 public memberCount;

    // ── Events ───────────────────────────────────────────────────────────────

    event ProposalCreated(
        uint256 indexed proposalId,
        address indexed proposer,
        string metadataURI,
        uint256 startTime,
        uint256 endTime
    );

    event VoteCast(
        uint256 indexed proposalId,
        address indexed voter,
        VoteOption option
    );

    event ProposalClosed(
        uint256 indexed proposalId,
        ProposalStatus status,
        uint256 forVotes,
        uint256 againstVotes,
        uint256 abstainVotes
    );

    event MemberAdded(address indexed member);
    event MemberRemoved(address indexed member);
    event AdminAdded(address indexed admin);

    // ── Modifiers ────────────────────────────────────────────────────────────

    modifier onlyOwnerOrAdmin() {
        require(owner == msg.sender || admins[msg.sender], "GovernanceSpace: not admin");
        _;
    }

    modifier onlyMember() {
        require(members[msg.sender], "GovernanceSpace: not a member");
        _;
    }

    // ── Constructor ──────────────────────────────────────────────────────────

    constructor(
        address _owner,
        string memory _communityId,
        uint256 _quorumPercent,
        uint256 _voteDurationSecs
    ) {
        require(_quorumPercent <= 100, "GovernanceSpace: quorum > 100");
        owner = _owner;
        communityId = _communityId;
        quorumPercent = _quorumPercent;
        voteDurationSecs = _voteDurationSecs;

        // Owner is automatically a member and admin
        members[_owner] = true;
        admins[_owner] = true;
        memberCount = 1;
    }

    // ── Membership ───────────────────────────────────────────────────────────

    /// @notice Anyone can join a community by calling this (wallet = member)
    function join() external {
        if (!members[msg.sender]) {
            members[msg.sender] = true;
            memberCount++;
            emit MemberAdded(msg.sender);
        }
    }

    function addAdmin(address _admin) external onlyOwnerOrAdmin {
        require(members[_admin], "GovernanceSpace: not a member");
        admins[_admin] = true;
        emit AdminAdded(_admin);
    }

    function removeMember(address _member) external onlyOwnerOrAdmin {
        require(_member != owner, "GovernanceSpace: cannot remove owner");
        if (members[_member]) {
            members[_member] = false;
            admins[_member] = false;
            if (memberCount > 0) memberCount--;
            emit MemberRemoved(_member);
        }
    }

    // ── Proposals ────────────────────────────────────────────────────────────

    /**
     * @notice Create a new proposal.
     * @param metadataURI  Pointer to off-chain metadata (title, description, etc.)
     * @param startTime    Unix timestamp when voting opens (0 = now)
     * @param endTime      Unix timestamp when voting closes (0 = now + voteDurationSecs)
     */
    function createProposal(
        string calldata metadataURI,
        uint256 startTime,
        uint256 endTime
    ) external onlyMember returns (uint256) {
        uint256 _start = startTime == 0 ? block.timestamp : startTime;
        uint256 _end   = endTime == 0   ? _start + voteDurationSecs : endTime;
        require(_end > _start, "GovernanceSpace: invalid time window");

        uint256 proposalId = ++_proposalCount;

        proposals[proposalId] = Proposal({
            id:            proposalId,
            proposer:      msg.sender,
            metadataURI:   metadataURI,
            startTime:     _start,
            endTime:       _end,
            forVotes:      0,
            againstVotes:  0,
            abstainVotes:  0,
            status:        ProposalStatus.ACTIVE,
            closed:        false
        });

        emit ProposalCreated(proposalId, msg.sender, metadataURI, _start, _end);
        return proposalId;
    }

    // ── Voting ───────────────────────────────────────────────────────────────

    /**
     * @notice Cast a vote on an active proposal.
     * @param proposalId  The on-chain proposal ID.
     * @param option      1=FOR, 2=AGAINST, 3=ABSTAIN
     */
    function vote(uint256 proposalId, uint8 option) external onlyMember {
        require(option >= 1 && option <= 3, "GovernanceSpace: invalid option");
        Proposal storage p = proposals[proposalId];
        require(p.id != 0,                      "GovernanceSpace: proposal not found");
        require(!p.closed,                       "GovernanceSpace: voting closed");
        require(block.timestamp >= p.startTime,  "GovernanceSpace: not started");
        require(block.timestamp <= p.endTime,    "GovernanceSpace: voting ended");
        require(votes[proposalId][msg.sender] == VoteOption.NONE, "GovernanceSpace: already voted");

        VoteOption vo = VoteOption(option);
        votes[proposalId][msg.sender] = vo;

        if (vo == VoteOption.FOR)          p.forVotes++;
        else if (vo == VoteOption.AGAINST) p.againstVotes++;
        else                               p.abstainVotes++;

        emit VoteCast(proposalId, msg.sender, vo);
    }

    // ── Close Proposal ───────────────────────────────────────────────────────

    /**
     * @notice Finalize a proposal after its end time has passed.
     *         Anyone can call this to trigger the on-chain result.
     */
    function closeProposal(uint256 proposalId) external {
        Proposal storage p = proposals[proposalId];
        require(p.id != 0,         "GovernanceSpace: proposal not found");
        require(!p.closed,          "GovernanceSpace: already closed");
        require(block.timestamp > p.endTime, "GovernanceSpace: still active");

        p.closed = true;

        uint256 totalVotes = p.forVotes + p.againstVotes + p.abstainVotes;
        uint256 quorumNeeded = (memberCount * quorumPercent) / 100;

        if (totalVotes < quorumNeeded) {
            p.status = ProposalStatus.EXPIRED;
        } else if (p.forVotes > p.againstVotes) {
            p.status = ProposalStatus.PASSED;
        } else {
            p.status = ProposalStatus.REJECTED;
        }

        emit ProposalClosed(proposalId, p.status, p.forVotes, p.againstVotes, p.abstainVotes);
    }

    // ── Views ────────────────────────────────────────────────────────────────

    function getProposal(uint256 proposalId) external view returns (Proposal memory) {
        return proposals[proposalId];
    }

    function getVote(uint256 proposalId, address voter) external view returns (VoteOption) {
        return votes[proposalId][voter];
    }

    function proposalCount() external view returns (uint256) {
        return _proposalCount;
    }
}
