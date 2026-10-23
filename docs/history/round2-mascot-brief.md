# Round 2: the Mascot Challenge

Your team built a design language in round 1 (your file is ../team-<yourteam>.html; read it again first, plus ../BRIEF.md for the hard rules, which all still apply). Now create the brand's **mascot**: a living character that lives on the website, drawn in the same medium (full-color text characters on canvas, simulated, with bloom).

## The bar
- **Alive.** It must have real emotions, real movement and real reactions. Not a looping sprite. It breathes, blinks or the equivalent for its kind, shifts weight, gets bored, notices things.
- **Emotions.** At least 7 distinct emotional states that read clearly at a glance (for example: content, curious, delighted, surprised, sleepy, shy or scared, sad or concerned, proud, focused). Transitions between them are smooth and believable.
- **Movement.** It moves with personality: its own gait, anticipation and follow-through, squash and stretch where it fits, secondary motion (tails, fins, smoke, sparks, antenna...).
- **Interactions.** It reacts to the visitor: watches the pointer, reacts to hover and clicks on it, can be petted, poked, dragged or fed (pick what fits), notices scrolling, typing, idle time, the real time of day, and page events (a form error makes it concerned, a success makes it celebrate, a loading state makes it busy). Touch gets equivalents.
- **Unique.** It must belong to YOUR brand and world and to nobody else's. Avoid the generic blob-with-eyes, clippy clones, and any existing famous mascot.
- **Respectful.** It never blocks content, can be minimized or sent to sleep with a button, keyboard users can interact with it, it has an aria-live line that describes its mood changes politely (throttled), and prefers-reduced-motion gives calm still poses that still change with emotion.
- **Efficient.** Same performance rules as round 1: one shared rAF loop, pauses offscreen and when hidden, DPR cap 2, bounded work.

## Process (you have one hour; run `date` at the start and check it as you go)
1. Explore at least 3 different character concepts as quick live sketches (small canvases, rough is fine).
2. Judge them yourself against your brand and the bar above. Pick the best fit.
3. Spend most of the hour building the winner to a high finish.
4. Stop starting new features at about 50 minutes; use the rest to verify and polish the pitch.

## Deliverable: one page that is both the pitch and the live character
Write a FULL HTML document to the path in your assignment. It is a beautiful pitch, the kind you would present to a client to win the job:
1. **Meet them.** Name, one-line personality, and the character live and interactive, large.
2. **Why this character.** The case for it: how it embodies the brand and its round-1 design language, what makes it unique, why people will love it and share it. Persuasive, specific, plain language.
3. **Emotion sheet.** Every emotion shown live side by side (small canvases or one canvas with a grid), each labeled, with what triggers it. Visitors can click one to make the main character feel it.
4. **Playground.** Ways to interact: buttons to simulate a form error, a success, loading, nighttime, and idle; plus direct play with the character. Tell people the secret interaction if there is one.
5. **In the wild.** Show it living in real site contexts: tucked in a nav bar, on a 404 page, during loading, celebrating a signup, asleep in a footer.
6. **Character rules.** 4 to 6 rules for how the brand uses it (when it appears, what it never does, voice if it speaks).
7. **The sketches.** The other concepts you explored, shown live and small, with one honest line each on why they lost.

Hard rules from round 1 still apply (full HTML doc, no external scripts, Google Fonts only, no network, no alert/confirm/prompt, 400px with no horizontal scroll, keyboard and focus, reduced motion with no loops, no em dashes, plain language, never "leverage", "delve", "utilize").

## Verify once, then finish
Playwright screenshots (Chromium preinstalled; node with NODE_PATH=$(npm root -g)) at 1280x900 full page and 400x850, plus a few frames of the main character in different emotions. Capture page errors. Look at them with the Read tool. Fix what you see. Keep helper files in mascots/<yourteam>/.

## Report back (short)
Mascot name, file path, one paragraph pitch, the emotions and their triggers, the interactions, the concepts you rejected and why, minutes used, known issues stated honestly.
