const { v4: uuid } = require('uuid');
const { findMany, insertOne } = require('./storage');

const SEED = [
  // IELTS Writing
  { category: 'ielts', text: 'Some people believe that universities should only accept students with the highest grades, while others think universities should be open to people of all ages and backgrounds. Discuss both views and give your opinion.' },
  { category: 'ielts', text: 'In many countries, the amount of crime committed by teenagers is growing. What are the causes of this, and what solutions can you suggest?' },
  { category: 'ielts', text: 'Some people think governments should spend money on railways, while others believe that more roads are a better investment. Discuss both and give your opinion.' },
  { category: 'ielts', text: 'Nowadays many people choose to be self-employed rather than work for a company. Why do you think this is? What are the advantages and disadvantages of being self-employed?' },
  { category: 'ielts', text: 'Some believe that children should be taught how to manage money at school. To what extent do you agree or disagree?' },
  { category: 'ielts', text: 'The internet has transformed the way information is shared around the world. Has this been a positive or negative development?' },
  { category: 'ielts', text: 'In some countries, more and more people are becoming interested in finding out about the history of the house or building they live in. What are the reasons for this? How can people research this?' },
  { category: 'ielts', text: 'Many museums and historical sites are mainly visited by tourists, not local people. Why is this? What can be done to attract locals?' },

  // College Admissions
  { category: 'college', text: 'Describe a challenge, setback, or failure you have experienced. How did it affect you, and what did you learn from it?' },
  { category: 'college', text: 'Reflect on a time when you questioned or challenged a belief or idea. What prompted your thinking? What was the outcome?' },
  { category: 'college', text: 'Discuss an accomplishment, event, or realization that sparked a period of personal growth and a new understanding of yourself or others.' },
  { category: 'college', text: 'Describe a topic, idea, or concept you find so engaging that it makes you lose track of time. Why does it captivate you?' },
  { category: 'college', text: 'Share an essay on any topic of your choice. It can be one you\'ve already written, one that responds to a different prompt, or one of your own design.' },
  { category: 'college', text: 'Tell us about a time you made a meaningful contribution to others in which the greater good was your focus.' },
  { category: 'college', text: 'What is one thing you would like your future roommate to know about you that isn\'t obvious from your application?' },
  { category: 'college', text: 'Describe a community you belong to and your place within it. How has it shaped who you are today?' },

  // Explore Myself / Life
  { category: 'self', text: 'Write about a moment in the past year when you felt most alive. What were you doing, who were you with, and why did it matter?' },
  { category: 'self', text: 'What is one belief you held five years ago that you no longer hold? What changed your mind?' },
  { category: 'self', text: 'Describe a fear you\'ve been avoiding. Why are you afraid of it, and what would happen if you faced it?' },
  { category: 'self', text: 'If you had to explain your life philosophy in a paragraph, what would it say? Write it out.' },
  { category: 'self', text: 'Who is a person you\'ve outgrown? Write honestly about what you learned from them and why the friendship changed.' },
  { category: 'self', text: 'What do you do that drains your energy but you keep doing anyway? Why?' },
  { category: 'self', text: 'Write about a version of yourself five years from now. What are they doing, and what did you do to get them there?' },
  { category: 'self', text: 'Describe the last time you felt deeply understood by someone. What did they say or do?' },

  // Creative
  { category: 'creative', text: 'Write a story that begins with the line: "The letter had been sitting in the drawer for eleven years."' },
  { category: 'creative', text: 'A character wakes up knowing they have exactly 24 hours left to live. Write the first hour.' },
  { category: 'creative', text: 'Describe a city that exists only between the hours of 3 AM and 5 AM.' },
  { category: 'creative', text: 'Write a scene where two strangers share an elevator, and something small but significant happens.' },
  { category: 'creative', text: 'A photograph falls out of an old library book. Write the story behind the photograph.' },
  { category: 'creative', text: 'Invent a new holiday. Describe how it\'s celebrated and why it exists.' },
  { category: 'creative', text: 'Write a dialogue between two people who love each other but can\'t say it.' },
  { category: 'creative', text: 'Describe the contents of a stranger\'s pockets and what those objects say about their life.' }
];

async function seedPromptsIfEmpty() {
  try {
    const existing = await findMany('prompts.json');
    if (existing.length > 0) return;
    const now = new Date().toISOString();
    for (const s of SEED) {
      await insertOne('prompts.json', {
        id: uuid(),
        text: s.text,
        category: s.category,
        difficulty: 'medium',
        suggestedWords: null,
        active: true,
        usedCount: 0,
        createdBy: 'seed',
        createdAt: now
      });
    }
    console.log(`[seedPrompts] Seeded ${SEED.length} prompts`);
  } catch (e) {
    console.error('[seedPrompts] Failed:', e.message);
  }
}

module.exports = { seedPromptsIfEmpty };
