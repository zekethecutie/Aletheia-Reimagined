import { GoogleGenerativeAI } from "@google/generative-ai";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY_2 || process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY || "";
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

export async function askGemini(prompt: string, system: string = "You are Aletheia, the supreme self-development architecture.") {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });
    const response = await model.generateContent({
      contents: [
        { role: "user", parts: [{ text: `${system}\n\nUser: ${prompt}` }] }
      ]
    });
    return response.response.text();
  } catch (error) {
    console.error("Gemini Error:", error);
    throw error;
  }
}

export async function askGeminiText(prompt: string, system: string = "You are Aletheia.") {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });
    const response = await model.generateContent({
      contents: [
        { role: "user", parts: [{ text: `${system}\n\nUser: ${prompt}` }] }
      ]
    });
    return response.response.text();
  } catch (error) {
    console.error("Gemini Error:", error);
    throw error;
  }
}

export const analyzeIdentityGemini = async (manifesto: string) => {
  const prompt = `Analyze this manifesto: "${manifesto}". Assign level 1 stats and a class. Be poetic. Return JSON ONLY with properties: approved (boolean), reason (string), initialStats (object with level, xp, xpToNextLevel, intelligence, physical, spiritual, social, wealth, class).`;
  try {
    const result = await askGemini(prompt, "You are the Gatekeeper of Aletheia.");
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    return JSON.parse(jsonMatch ? jsonMatch[0] : result);
  } catch (error) {
    console.error("Failed to parse identity analysis:", error);
    return { approved: true, reason: "You walk the path.", initialStats: { level: 1, xp: 0, xpToNextLevel: 100, intelligence: 5, physical: 5, spiritual: 5, social: 5, wealth: 5, class: "Seeker" } };
  }
};

export const getDailyWisdomGemini = async () => {
  const prompt = `Provide a single piece of profound, mystical daily wisdom for a seeker of truth. Return JSON ONLY with: text (string), author (string).`;
  try {
    const result = await askGemini(prompt, "You are the Oracle of Aletheia.");
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    return JSON.parse(jsonMatch ? jsonMatch[0] : result);
  } catch (error) {
    console.error("Failed to get daily wisdom:", error);
    return { text: "The path unfolds before you.", author: "The Oracle" };
  }
};

export const getCouncilFeedbackGemini = async (habitName: string, action: string, stats: any) => {
  const prompt = `User performed "${action}" for habit "${habitName}". User is a ${stats.class} level ${stats.level}. Provide a council verdict feedback. Return JSON ONLY with: success (boolean), feedback (string), xp (number), stat_reward (object with stats).`;
  try {
    const result = await askGemini(prompt, "You are the High Council of Aletheia.");
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    return JSON.parse(jsonMatch ? jsonMatch[0] : result);
  } catch (error) {
    console.error("Failed to get council feedback:", error);
    return { success: true, feedback: "Your effort is noted.", xp: 10, stat_reward: { intelligence: 1, physical: 1, spiritual: 1, social: 1, wealth: 0 } };
  }
};
