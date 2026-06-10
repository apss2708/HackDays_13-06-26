// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./GovernanceSpace.sol";

/**
 * @title GovernanceFactory
 * @dev Single-entry-point factory to deploy and register GovernanceSpace contracts.
 *      Emits CommunityCreated so the off-chain indexer can discover new communities.
 */
contract GovernanceFactory {

    struct CommunityRecord {
        address spaceAddress;
        address owner;
        string  communityId;  // off-chain UUID
        uint256 createdAt;
    }

    uint256 private _communityCount;
    mapping(uint256 => CommunityRecord) public communities;
    // communityId (string) => spaceAddress for quick lookup
    mapping(string => address) public spaceByIdStr;

    event CommunityCreated(
        uint256 indexed index,
        address indexed spaceAddress,
        address indexed owner,
        string communityId
    );

    /**
     * @notice Deploy a new GovernanceSpace and register it in the factory.
     * @param communityId      Off-chain UUID linking to the DB record.
     * @param quorumPercent    Required quorum threshold (0–100).
     * @param voteDurationSecs Default voting window in seconds.
     */
    function createCommunity(
        string calldata communityId,
        uint256 quorumPercent,
        uint256 voteDurationSecs
    ) external returns (address) {
        require(bytes(communityId).length > 0,        "Factory: empty communityId");
        require(spaceByIdStr[communityId] == address(0), "Factory: already registered");
        require(quorumPercent <= 100,                 "Factory: quorum > 100");
        require(voteDurationSecs >= 60,               "Factory: duration too short");

        GovernanceSpace space = new GovernanceSpace(
            msg.sender,
            communityId,
            quorumPercent,
            voteDurationSecs
        );

        uint256 idx = ++_communityCount;
        communities[idx] = CommunityRecord({
            spaceAddress: address(space),
            owner:        msg.sender,
            communityId:  communityId,
            createdAt:    block.timestamp
        });
        spaceByIdStr[communityId] = address(space);

        emit CommunityCreated(idx, address(space), msg.sender, communityId);
        return address(space);
    }

    function communityCount() external view returns (uint256) {
        return _communityCount;
    }

    function getSpaceAddress(string calldata communityId) external view returns (address) {
        return spaceByIdStr[communityId];
    }
}
