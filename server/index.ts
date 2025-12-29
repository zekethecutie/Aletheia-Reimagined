import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { query, initializeDatabase } from './db';
import { verifyPassword, hashPassword } from './auth';
import { askDeepSeek, askDeepSeekText, analyzeIdentityDeepSeek, getCouncilFeedbackDeepSeek, getDailyWisdomDeepSeek } from './deepseekService';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize Database
initializeDatabase();

app.use(cors());
app.use(express.json());

// Auth Routes
app.get('/api/check-username', async (req: Request, res: Response) => {
  try {
    const { username } = req.query;
    if (!username) return res.status(400).json({ error: 'Username required' });
    
    const result = await query(
      'SELECT id FROM profiles WHERE LOWER(username) = LOWER($1)',
      [username.toString()]
    );
    res.json({ available: result.rows.length === 0 });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/register', async (req: Request, res: Response) => {
  try {
    const { username, password, manifesto, stats, originStory } = req.body;
    
    const existing = await query('SELECT id FROM profiles WHERE LOWER(username) = LOWER($1)', [username]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Designation already claimed.' });
    }

    const id = `u_${Buffer.from(username.toLowerCase()).toString('hex').substring(0, 50)}@aletheia.app`;
    const passwordHash = await hashPassword(password);

    await query(
      'INSERT INTO profiles (id, username, password_hash, manifesto, origin_story, stats, entropy, following) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [id, username, passwordHash, manifesto, originStory, JSON.stringify(stats), 0, JSON.stringify([])]
    );

    res.json({ success: true, id, username });
  } catch (error: any) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Protocol Failed: ' + error.message });
  }
});

app.post('/api/auth/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    const result = await query('SELECT * FROM profiles WHERE LOWER(username) = LOWER($1)', [username]);

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const isValid = await verifyPassword(password, user.password_hash || user.password || '');
    
    if (!isValid && user.password !== password && user.password_hash !== password) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    res.json({ 
      id: user.id, 
      username: user.username,
      stats: user.stats,
      tasks: user.tasks || [],
      inventory: user.inventory || [],
      manifesto: user.manifesto,
      origin_story: user.origin_story,
      created_at: user.created_at,
      entropy: user.entropy || 0,
      following: user.following || []
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Profile Routes
app.get('/api/profile/:id', async (req: Request, res: Response) => {
  try {
    const result = await query('SELECT * FROM profiles WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });

    const profile = result.rows[0];
    res.json({
      id: profile.id,
      username: profile.username,
      isVerified: true,
      created_at: profile.created_at,
      stats: profile.stats,
      tasks: profile.tasks || [],
      inventory: profile.inventory || [],
      manifesto: profile.manifesto,
      origin_story: profile.origin_story,
      avatar_url: profile.avatar_url,
      cover_url: profile.cover_url,
      entropy: profile.entropy,
      following: profile.following || []
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/profile/:id/update', async (req: Request, res: Response) => {
  try {
    const { stats, tasks, inventory, avatarUrl, coverUrl, entropy, following } = req.body;
    await query(
      'UPDATE profiles SET stats = $1, tasks = $2, inventory = $3, avatar_url = $4, cover_url = $5, entropy = $6, following = $7 WHERE id = $8',
      [JSON.stringify(stats), JSON.stringify(tasks), JSON.stringify(inventory), avatarUrl, coverUrl, entropy, JSON.stringify(following), req.params.id]
    );

    const profile = await query('SELECT * FROM profiles WHERE id = $1', [req.params.id]);
    res.json(profile.rows[0]);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// AI Proxy - Mysterious Name
app.post('/api/ai/mysterious-name', async (req: Request, res: Response) => {
  try {
    const name = await askDeepSeekText("Generate a single mysterious RPG-style name (e.g., Kaelen, Vyr, Sylas). Just the name.", "You are the Naming Oracle.");
    res.json({ name: name.trim().split('\n')[0].replace(/[^a-zA-Z]/g, '') });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create Quest with AI-assigned rewards
app.post('/api/ai/quest-reward', async (req: Request, res: Response) => {
  try {
    const { title, system } = req.body;
    if (!title) {
      return res.status(400).json({ error: 'Missing title' });
    }

    const result = await askDeepSeek(system, "You are the Quest Arbiter.");
    let rewards;
    try {
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      rewards = JSON.parse(jsonMatch ? jsonMatch[0] : result);
    } catch (e) {
      console.error('Failed to parse rewards:', result);
      rewards = { difficulty: 'C', xp_reward: 100, stat_reward: {} };
    }

    // Extract userId from system message context (passed separately)
    const userIdMatch = req.body.userId;
    if (userIdMatch) {
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);
      await query(
        'INSERT INTO quests (user_id, text, difficulty, xp_reward, stat_reward, expires_at) VALUES ($1, $2, $3, $4, $5, $6)',
        [userIdMatch, title, rewards.difficulty || 'C', rewards.xp_reward || 100, JSON.stringify(rewards.stat_reward || {}), expiresAt]
      );
    }
    res.json({ success: true });
  } catch (error: any) {
    console.error('Quest reward error:', error);
    res.status(500).json({ error: error.message });
  }
});

// AI Quest Generation
app.post('/api/ai/quest/generate', async (req: Request, res: Response) => {
  try {
    const { userId, stats, goals } = req.body;
    
    if (!userId || !stats) {
      return res.status(400).json({ error: 'Missing userId or stats' });
    }
    
    const userQuests = await query('SELECT * FROM quests WHERE user_id = $1 AND completed = false', [userId]);
    if (userQuests.rows.length >= 5) {
      return res.json({ success: true, message: "Your spirit is already laden with trials. Complete them first." });
    }

    const system = `You are the Eye of Aletheia, a supreme self-development architecture. 
    Construct 3 real-world sacred trials for a ${stats?.class || 'Seeker'} level ${stats?.level || 1}.
    GOALS: ${JSON.stringify(goals || [])}
    
    CRITICAL PROTOCOLS:
    1. ACTIONS: ONLY real-world self-improvement actions (e.g., "Complete a 30-min deep work session", "Run 3km", "Meditate for 15 mins").
    2. UTILITY: Each quest must directly contribute to the user's evolution.
    3. DIFFICULTY: E (Easy) to S (Supreme).
    4. Return JSON ONLY: { "quests": [{ "text": "string", "difficulty": "E-S", "xp_reward": number, "stat_reward": { "physical": number, "intelligence": number, "spiritual": number, "social": number, "wealth": number }, "duration_hours": number }] }`;
    
    const result = await askDeepSeek(system, "You are the Quest Weaver.");
    console.log('Quest Generation Result:', result);
    let generatedQuests;
    try {
      // Handle potential extra text or markdown from AI
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : result);
      generatedQuests = parsed.quests || [];
    } catch (e) {
      console.error('Failed to parse quests:', result);
      return res.status(500).json({ error: 'Failed to manifest quests' });
    }
    
    for (const q of generatedQuests) {
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + (q.duration_hours || 24));
      await query(
        'INSERT INTO quests (user_id, text, difficulty, xp_reward, stat_reward, expires_at) VALUES ($1, $2, $3, $4, $5, $6)',
        [userId, q.text, q.difficulty, q.xp_reward, JSON.stringify(q.stat_reward), expiresAt]
      );
    }
    res.json({ success: true });
  } catch (error: any) {
    console.error('Quest generation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Achievement analysis
app.post('/api/achievements/calculate', async (req: Request, res: Response) => {
  try {
    const { text, userId, stats } = req.body;
    const system = `You are the Chronicler of Aletheia. Analyze this real-world achievement: "${text}". 
    Evaluate its impact on a ${stats.class} at level ${stats.level}.
    Return JSON ONLY: { "xpGained": number, "statsIncreased": { "physical": number, "intelligence": number, "spiritual": number, "social": number, "wealth": number }, "systemMessage": "string" }`;
    
    const result = await askDeepSeek(system, "You are the Chronicler.");
    const data = JSON.parse(result);
    await query('INSERT INTO achievements (user_id, title, description, icon) VALUES ($1, $2, $3, $4)', 
      [userId, "Great Feat Logged", text, "🏆"]);
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Posts
app.post('/api/posts/like', async (req: Request, res: Response) => {
  try {
    const { post_id, user_id } = req.body;
    const postResult = await query('SELECT liked_by, author_id FROM posts WHERE id = $1', [post_id]);
    if (postResult.rows.length === 0) return res.status(404).json({ error: 'Post not found' });

    const post = postResult.rows[0];
    let likedBy = post.liked_by || [];
    const isLiked = likedBy.includes(user_id);

    if (isLiked) {
      likedBy = likedBy.filter((id: string) => id !== user_id);
    } else {
      likedBy.push(user_id);
    }

    await query('UPDATE posts SET liked_by = $1 WHERE id = $2', [JSON.stringify(likedBy), post_id]);
    res.json({ success: true, isLiked: !isLiked, resonance: likedBy.length });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/posts', async (req: Request, res: Response) => {
  try {
    const result = await query(`
      SELECT p.*, pr.username, pr.avatar_url, pr.stats, pr.cover_url, 
             (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comment_count
      FROM posts p
      LEFT JOIN profiles pr ON p.author_id = pr.id
      ORDER BY p.created_at DESC
      LIMIT 50
    `);
    res.json(result.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/posts', async (req: Request, res: Response) => {
  try {
    const { author_id, content } = req.body;
    if (!author_id || !content) {
      return res.status(400).json({ error: 'Author and content required' });
    }
    const result = await query(
      'INSERT INTO posts (author_id, content, liked_by) VALUES ($1, $2, $3) RETURNING *',
      [author_id, content, JSON.stringify([])]
    );
    res.json(result.rows[0]);
  } catch (error: any) {
    console.error('Post creation error:', error);
    res.status(500).json({ error: 'Transmission failed: ' + error.message });
  }
});

// Quests
app.get('/api/quests/:userId', async (req: Request, res: Response) => {
  try {
    const result = await query('SELECT * FROM quests WHERE user_id = $1 ORDER BY created_at DESC', [req.params.userId]);
    res.json(result.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/quests/:id/complete', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const questResult = await query('SELECT * FROM quests WHERE id = $1', [id]);
    if (questResult.rows.length === 0) return res.status(404).json({ error: 'Quest not found' });
    const quest = questResult.rows[0];

    await query('UPDATE quests SET completed = true WHERE id = $1', [id]);
    res.json({ success: true, reward: { xp: quest.xp_reward, stats: quest.stat_reward } });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});


// Habits
app.post('/api/habits', async (req: Request, res: Response) => {
  try {
    const { user_id, name } = req.body;
    const result = await query(
      'INSERT INTO habits (user_id, name, streak) VALUES ($1, $2, $3) RETURNING *',
      [user_id, name, 0]
    );
    res.json(result.rows[0]);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/habits/:userId', async (req: Request, res: Response) => {
  try {
    const result = await query('SELECT * FROM habits WHERE user_id = $1', [req.params.userId]);
    res.json(result.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/habits/track', async (req: Request, res: Response) => {
  try {
    const { user_id, habit_id, action } = req.body;
    const habitResult = await query('SELECT * FROM habits WHERE id = $1 AND user_id = $2', [habit_id, user_id]);
    if (habitResult.rows.length === 0) return res.status(404).json({ error: 'Habit not found' });

    const userResult = await query('SELECT stats FROM profiles WHERE id = $1', [user_id]);
    const userStats = userResult.rows[0].stats;

    const habit = habitResult.rows[0];
    const verdict = await getCouncilFeedbackDeepSeek(habit.name, action, userStats);

    const newStreak = (habit.streak || 0) + 1;
    await query('UPDATE habits SET streak = $1 WHERE id = $2', [newStreak, habit_id]);
    
    res.json({ 
      success: true, 
      feedback: verdict.feedback, 
      xp: verdict.xp, 
      stat_reward: verdict.stat_reward 
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Notifications
app.get('/api/notifications/:userId', async (req: Request, res: Response) => {
  try {
    const result = await query('SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC', [req.params.userId]);
    res.json(result.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/notifications/:id/read', async (req: Request, res: Response) => {
  try {
    await query('UPDATE notifications SET is_read = true WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Mirror Scenario
app.post('/api/ai/mirror/scenario', async (req: Request, res: Response) => {
  try {
    const { stats } = req.body;
    if (!stats) {
      return res.status(400).json({ error: 'Missing stats' });
    }
    const system = `You are the Mirror of Aletheia. Generate a moral dilemma for a ${stats.class || 'Seeker'} level ${stats.level || 1}. 
    Return JSON ONLY: { "situation": "string", "choiceA": "string", "choiceB": "string", "testedStat": "string" }`;
    const result = await askDeepSeek(system, "You are the Mirror.");
    const parsed = JSON.parse(result);
    if (parsed && parsed.situation) {
      res.json(parsed);
    } else {
      res.json({ situation: "A fork in the road.", choiceA: "Left", choiceB: "Right", context: "Void", testedStat: "spiritual" });
    }
  } catch (error: any) {
    console.error('Mirror scenario error:', error);
    res.json({ situation: "A fork in the road.", choiceA: "Left", choiceB: "Right", context: "Void", testedStat: "spiritual" });
  }
});

app.post('/api/ai/mirror/evaluate', async (req: Request, res: Response) => {
  try {
    const { situation, choice, stats } = req.body;
    if (!situation || !choice) {
      return res.status(400).json({ error: 'Missing situation or choice' });
    }
    const system = `Analyze this choice: "${choice}" in response to: "${situation}".
    The user is a ${stats?.class || 'Seeker'} level ${stats?.level || 1}.
    Evaluate the outcome and reward. Reward can be STAT_ONLY or ARTIFACT.
    Return JSON ONLY: { 
      "outcome": "string", 
      "rewardType": "STAT_ONLY" | "ARTIFACT",
      "statChange": { "intelligence": number, "physical": number, "spiritual": number, "social": number, "wealth": number },
      "reward": { "name": "string", "description": "string", "icon": "string", "rarity": "COMMON" | "RARE" | "LEGENDARY" | "MYTHIC", "effect": "string" }
    }`;
    const result = await askDeepSeek(system, "You are the Arbiter of the Mirror.");
    const parsed = JSON.parse(result);
    if (parsed && parsed.outcome) {
      res.json(parsed);
    } else {
      res.json({ outcome: "Fate ripples.", statChange: { intelligence: 5, physical: 0, spiritual: 0, social: 0, wealth: 0 }, rewardType: 'STAT_ONLY' });
    }
  } catch (error: any) {
    console.error('Mirror evaluate error:', error);
    res.json({ outcome: "Fate ripples.", statChange: { intelligence: 5, physical: 0, spiritual: 0, social: 0, wealth: 0 }, rewardType: 'STAT_ONLY' });
  }
});

// Advisor/Consultation Route
app.post('/api/ai/advisor', async (req: Request, res: Response) => {
  try {
    const { advisor, message, userId } = req.body;
    const system = `You are the ${advisor} of Aletheia. Provide guidance to the user. Be concise and maintain your character.`;
    const text = await askDeepSeekText(message, system);
    res.json({ text });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Profile Follow
app.post('/api/profile/:id/follow', async (req: Request, res: Response) => {
  try {
    const { followerId } = req.body;
    const targetId = req.params.id;
    
    const result = await query('SELECT following FROM profiles WHERE id = $1', [followerId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Follower not found' });
    
    let following = result.rows[0].following || [];
    if (!following.includes(targetId)) {
      following.push(targetId);
      await query('UPDATE profiles SET following = $1 WHERE id = $2', [JSON.stringify(following), followerId]);
    } else {
      following = following.filter((id: string) => id !== targetId);
      await query('UPDATE profiles SET following = $1 WHERE id = $2', [JSON.stringify(following), followerId]);
    }
    
    res.json({ success: true, following });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
app.post('/api/ai/analyze-identity', async (req: Request, res: Response) => {
  try {
    const { manifesto } = req.body;
    const result = await analyzeIdentityDeepSeek(manifesto);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Daily Wisdom
app.get('/api/ai/wisdom', async (req: Request, res: Response) => {
  try {
    const wisdom = await getDailyWisdomDeepSeek();
    res.json(wisdom);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});

export default app;
