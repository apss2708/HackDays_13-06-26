import { prisma } from "../prisma";

const GOVERNANCE_RISK_PATTERNS: Array<{ pattern: RegExp; risk: string }> = [
  { pattern: /treasury|fund|budget|spend|allocat/i,     risk: "💰 Involves treasury allocation — ensure finance committee has reviewed this." },
  { pattern: /urgent|immediate|asap|fast.track/i,       risk: "⚡ Marked as urgent — compressed voting window may reduce participation." },
  { pattern: /\$[\d,]+|eth\s+\d+|\d+\s*eth/i,          risk: "💸 Contains specific financial figures — independent audit recommended." },
  { pattern: /remove|expel|ban|revoke/i,                 risk: "🚫 Involves member removal — ensure due process and appeals policy apply." },
  { pattern: /governance|constitution|bylaws|rule/i,     risk: "📜 Modifies governance rules — changes to core rules require supermajority." },
  { pattern: /partnership|partner|collaborat/i,          risk: "🤝 External partnership — legal review of agreements recommended." },
  { pattern: /vote|quorum|threshold/i,                   risk: "🗳️ Changes voting parameters — affects future decision-making power." },
  { pattern: /deadline|expir|sunset/i,                   risk: "⏰ Time-sensitive outcome — monitor voting closely near deadline." },
  { pattern: /token|nft|airdrop|mint/i,                  risk: "🪙 Token-related action — potential regulatory and economic implications." },
  { pattern: /integrat|deploy|launch|upgrade/i,          risk: "🔧 Technical deployment — requires security review and testing before execution." },
];

function generateMockSummary(title: string, description: string): string {
  const words = description.split(/\s+/).length;
  const firstSentence = description.split(/[.!?]/)[0]?.trim() || title;

  if (words < 50) {
    return `This proposal—"${title}"—outlines a focused initiative. ${firstSentence}. The scope appears well-defined and is suitable for immediate community voting.`;
  }

  return `This proposal titled "${title}" presents a structured governance action for community review. ${firstSentence}. The proposal covers key considerations and outlines expected outcomes, requesting member approval through on-chain voting.`;
}

function generateMockRisks(title: string, description: string): string[] {
  const text = `${title} ${description}`;
  const detectedRisks: string[] = [];

  for (const { pattern, risk } of GOVERNANCE_RISK_PATTERNS) {
    if (pattern.test(text)) detectedRisks.push(risk);
  }

  // Always add a general participation risk
  detectedRisks.push("📊 Monitor voter participation — low turnout may result in quorum failure.");

  if (detectedRisks.length === 1) {
    detectedRisks.unshift("✅ No major specific risks detected — standard governance review applies.");
  }

  return detectedRisks.slice(0, 5);
}

async function callOpenAI(title: string, description: string): Promise<{ summary: string; risks: string[] } | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are a DAO governance analyst. Analyze governance proposals and return JSON with:
- summary: 2-3 sentence plain-language summary of what the proposal is asking
- risks: array of 3-5 concise risk bullets (start each with an emoji, be specific to the proposal)
Always return valid JSON only, no markdown.`,
          },
          {
            role: "user",
            content: `Proposal Title: ${title}\n\nProposal Description:\n${description}`,
          },
        ],
        temperature: 0.3,
        max_tokens: 500,
      }),
    });

    const data = (await response.json()) as any;
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;
    return JSON.parse(content);
  } catch {
    return null;
  }
}

async function callGemini(title: string, description: string): Promise<{ summary: string; risks: string[] } | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `You are a DAO governance analyst. Analyze this governance proposal and return ONLY a valid JSON object (no markdown, no code block) with two fields:
- "summary": a 2-3 sentence plain-language summary of what the proposal is asking
- "risks": an array of 3-5 concise risk bullets (start each with an emoji, be specific to the proposal)

Proposal Title: ${title}

Proposal Description:
${description}`,
                },
              ],
            },
          ],
          generationConfig: { temperature: 0.3, maxOutputTokens: 500 },
        }),
      }
    );

    const data = (await response.json()) as any;
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!content) return null;
    // Strip any markdown code fences
    const cleaned = content.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

export async function generateProposalInsight(proposalId: string, title: string, description: string) {
  let summary: string;
  let risks: string[];

  // Try real LLM providers in order (OpenAI → Gemini → mock)
  const llmResult = await callGemini(title, description) || await callOpenAI(title, description);

  if (llmResult) {
    summary = llmResult.summary;
    risks = Array.isArray(llmResult.risks) ? llmResult.risks : [llmResult.risks];
  } else {
    // Contextual mock fallback
    summary = generateMockSummary(title, description);
    risks = generateMockRisks(title, description);
  }

  await prisma.proposalInsight.upsert({
    where: { proposalId },
    update: { aiSummary: summary, aiRisks: JSON.stringify(risks) },
    create: { proposalId, aiSummary: summary, aiRisks: JSON.stringify(risks) },
  });

  console.log(`✨ AI insight generated for proposal ${proposalId}`);
}
