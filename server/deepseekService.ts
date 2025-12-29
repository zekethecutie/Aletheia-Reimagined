import OpenAI from "openai";

const openrouter = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY,
});

const DEEPSEEK_MODEL = "deepseek/deepseek-chat";

export async function askDeepSeek(prompt: string, system: string = "You are Aletheia, the supreme self-development architecture.") {
  try {
    const response = await openrouter.chat.completions.create({
      model: DEEPSEEK_MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" }
    });
    return response.choices[0]?.message?.content || "{}";
  } catch (error) {
    console.error("DeepSeek Error:", error);
    throw error;
  }
}

export async function askDeepSeekText(prompt: string, system: string = "You are Aletheia.") {
  try {
    const response = await openrouter.chat.completions.create({
      model: DEEPSEEK_MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt }
      ]
    });
    return response.choices[0]?.message?.content || "";
  } catch (error) {
    console.error("DeepSeek Error:", error);
    throw error;
  }
}

export const analyzeIdentityDeepSeek = async (manifesto: string) => {
  const prompt = `Analyze this manifesto: "${manifesto}". Assign level 1 stats and a class. Be poetic. Return JSON ONLY with properties: approved (boolean), reason (string), initialStats (object with level, xp, xpToNextLevel, intelligence, physical, spiritual, social, wealth, class).`;
  const result = await askDeepSeek(prompt, "You are the Gatekeeper of Aletheia.");
  return JSON.parse(result);
};

export const getDailyWisdomDeepSeek = async () => {
  const prompt = `Provide a single piece of profound, mystical daily wisdom for a seeker of truth. Return JSON ONLY with: text (string), author (string).`;
  const result = await askDeepSeek(prompt, "You are the Oracle of Aletheia.");
  return JSON.parse(result);
};

export const getCouncilFeedbackDeepSeek = async (habitName: string, action: string, stats: any) => {
  const prompt = `User performed "${action}" for habit "${habitName}". User is a ${stats.class} level ${stats.level}. Provide a council verdict feedback. Return JSON ONLY with: success (boolean), feedback (string), xp (number), stat_reward (object with stats).`;
  const result = await askDeepSeek(prompt, "You are the High Council of Aletheia.");
  return JSON.parse(result);
};
