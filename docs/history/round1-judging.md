# Design Language Championship: judging rules

Four teams built a design-language specimen page from the same brief (BRIEF.md in this folder; read it so you know what was asked):
- team-matter.html (living materials)
- team-signal.html (signal and transmission)
- team-sky.html (sky, weather and time)
- team-creatures.html (living creatures)

You are ONE judge on a panel of six. You score ONLY your own criterion. Other judges cover the rest, so do not let other qualities sway your score.

## How to judge
1. Read BRIEF.md, then read each entry's source.
2. Look at every entry running. Chromium is preinstalled; use Playwright from node with NODE_PATH=$(npm root -g). Open each file with a file:// URL. Take screenshots at 1280x900 (full page and key moments) and 400x850. Hover, click, press keys and scroll where it matters for your criterion. Read screenshots with the Read tool. Keep your scripts and screenshots in a subfolder judges/<your-criterion>/ inside this folder.
3. Be a tough, specific judge. Use the full 1 to 10 range. A 10 means world-class on this criterion. Ties are allowed but should be rare. Every score needs evidence you saw (a specific element, behavior, measurement or line of code), not adjectives.
4. Judge all four with the same method in the same session so it is fair.

## Output
Write a JSON file to judges/<your-criterion>.json with exactly this shape:
{
  "criterion": "<name>",
  "method": "<one or two sentences on how you judged>",
  "scores": {
    "matter":    {"score": N, "best": "<strongest thing for this criterion>", "worst": "<weakest thing>", "evidence": "<what you saw or measured>"},
    "signal":    {...},
    "sky":       {...},
    "creatures": {...}
  },
  "winner": "<team key>",
  "one_line_verdict": "<plain language, no em dashes>"
}
Then reply with a short summary: the four scores, the winner and why in two sentences. No em dashes.
