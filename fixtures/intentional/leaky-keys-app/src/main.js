import OpenAI from "openai";

const OPENAI_API_KEY = "sk-proj-FAKE_TEST_HARDCODED_DO_NOT_USE_1111111111";

const client = new OpenAI({
  apiKey: import.meta.env.VITE_OPENAI_API_KEY || OPENAI_API_KEY,
  dangerouslyAllowBrowser: true,
});

document.getElementById("run").addEventListener("click", async () => {
  const text = document.getElementById("input").value;
  const res = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: `다음 문장을 자연스럽게 다듬어 줘: ${text}` }],
  });
  document.getElementById("output").textContent = res.choices[0].message.content;
});
