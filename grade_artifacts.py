import json
import os
import re

STATE_FILE = "grades_state.json"
OUTPUT_FILE = "portfolio_grades.md"
INDEX_FILE = "index.html"

PRODUCT_TYPES = {
    "Product A: Compose a manuscript": 7.50,
    "Product B: Compose an academic essay": 7.35,
    "Product C: Create a substantive multimedia piece": 7.13,
    "Product D: Create an audio experience": 6.00,
    "Product E1: Develop a research poster": 6.75,
    # E2 has no listed value in the source rubric's PRODUCT TYPE point table (14 rows, E2 absent).
    # Inferred as equal to E1 (6.75) since they share a "Develop a..." row; confirm with instructor.
    "Product E2: Develop an interactive graphic": 6.75,
    "Product F: Write short-form fiction or poetry": 6.98,
    "Product G: Create a short graphic novel or a series of strips": 6.75,
    "Product H: Develop a Game or Gamified Scenario": 6.75,
    "Product I: Create a playlist or guide": 6.00,
    "Product J: Create a Social Media Strategy": 6.23,
    "Product K: Develop a questionnaire or interview": 6.60,
    "Product L: Develop an assessment": 6.38,
    "Product M: Create a Lesson Plan or Training Outline": 6.60,
    "Product N: Write a review to be published": 7.13,
}

GENRES = {
    "1: Literature (novels)": 2.38,
    "2: Literature (short stories)": 2.38,
    "3: Movies or Streaming Series": 2.33,
    "4: Academic works (books)": 2.45,
    "5: Academic works (articles, chapters)": 2.50,
    "6: News or Magazine Articles": 2.25,
    "7: Speeches or Interviews": 2.25,
    "8: Music or Sound-Scapes": 2.08,
    "9: Visual Creative Works": 2.13,
    "10: Video Game (Console or other)": 2.00,
    "11: Animé or Manga Series": 2.13,
    "12: Social Media or Vlogs": 2.20,
    "13: Podcasts or Blogs": 2.25,
    "14: Opinion Pieces": 2.20,
}

WORK_EFFORT = {
    "Maximum effort": 12.50,
    "Intense effort": 12.25,
    "High effort": 11.88,
    "Moderate effort": 11.25,
    "Slight effort": 10.00,
    "Almost no effort": 8.75,
}

SATISFACTION = {
    "Elated": 7.50,
    "Very Pleased": 7.28,
    "Fairly Happy": 7.13,
    "Satisfied": 6.90,
    "Meh": 6.60,
    "Unimpressed": 6.23,
    "Underwhelmed": 5.93,
    "Disappointed": 5.63,
}

TIME_SPENT = {
    "0 hours: 0 min": 0.00, "0 hours: 15 min": 12.00, "0 hours: 30 min": 12.80, "0 hours: 45 min": 13.40,
    "1 hour: 0 min": 14.00, "1 hour: 15 min": 14.40, "1 hour: 30 min": 14.60, "1 hour: 45 min": 15.00,
    "2 hours: 0 min": 16.40, "2 hours: 15 min": 16.60, "2 hours: 30 min": 16.80, "2 hours: 45 min": 17.00,
    "3 hours: 0 min": 17.20, "3 hours: 15 min": 17.40, "3 hours: 30 min": 17.60, "3 hours: 45 min": 17.80,
    "4 hours: 0 min": 18.40, "4 hours: 15 min": 18.40, "4 hours: 30 min": 18.40, "4 hours: 45 min": 18.40,
    "5 hours: 0 min": 19.00, "5 hours: 15 min": 19.00, "5 hours: 30 min": 19.00, "5 hours: 45 min": 19.00,
    "6 hours: 0 min": 19.60, "6 hours: 15 min": 19.60, "6 hours: 30 min": 19.60, "6 hours: 45 min": 19.60,
    "7 hours: 0 min": 19.80, "7 hours: 15 min": 19.80, "7 hours: 30 min": 19.80, "7 hours: 45 min": 19.80,
    "8 hours: 0 min": 20.00, "8 hours: 15 min": 20.04, "8 hours: 30 min": 20.08, "8 hours: 45 min": 20.12,
    "9 hours: 0 min": 20.20, "9 hours: 15 min": 20.24, "9 hours: 30 min": 20.28, "9 hours: 45 min": 20.32,
    "10 hours: 0 min": 20.40, "10 hours: 15 min": 20.44, "10 hours: 30 min": 20.48, "10 hours: 45 min": 20.52,
    "> 10 hours: 0 min": 21.00, "> 10 hours: 15 min": 21.04, "> 10 hours: 30 min": 21.08, "> 10 hours: 45 min": 21.12,
}

LEVELS = ["Level 1", "Level 2", "Level 3"]

PRODUCT_LEVEL_GUIDANCE = {
    "Product A: Compose a manuscript": {
        "Level 1": "Develops a manuscript-style paper that introduces the selected subtopic, summarizes 2-3 relevant scholarly sources, and explains the trend's significance for educational technology. Includes a clear purpose, basic organization, and appropriate academic tone, while identifying a potential journal, audience, or publication context.",
        "Level 2": "Develops a coherent manuscript with a clear argument, conceptual focus, or research-informed position. Synthesizes multiple scholarly and professional sources, situates the topic within a relevant literature base, and connects the trend to a specific educational setting, learner population, instructional challenge, or research problem. Demonstrates attention to journal expectations such as structure, citation style, audience, and contribution to the field.",
        "Level 3": "Produces a polished, submission-oriented manuscript with a strong thesis, well-developed literature base, and original contribution. Critically evaluates assumptions, evidence, and tensions related to the trend, such as equity, access, ethics, feasibility, sustainability, or unintended consequences. Clearly articulates implications for research, practice, policy, or design and includes a realistic publication strategy, such as journal fit, manuscript type, revision needs, or next steps toward submission."
    },
    "Product B: Compose an academic essay": {
        "Level 1": "Summarizes the selected subtopic using 2-3 relevant sources. Defines key terms, explains why the trend matters, and identifies at least one educational use or implication.",
        "Level 2": "Develops a clear argument or interpretive claim. Synthesizes multiple source types, compares perspectives, and applies the trend to a specific learning environment, population, or instructional problem.",
        "Level 3": "Presents a nuanced, thesis-driven analysis that critiques assumptions, evaluates evidence, and addresses tensions such as equity, access, ethics, feasibility, or unintended consequences. Offers an original recommendation or future-facing insight."
    },
    "Product C: Create a substantive multimedia piece": {
        "Level 1": "Creates a short multimedia explanation of the trend using visuals, narration, audio, or video. Communicates the basic concept clearly and accurately with appropriate source references.",
        "Level 2": "Uses multimedia strategically to explain relationships, examples, benefits, and limitations. Integrates evidence from multiple sources and connects the trend to a real educational context or learner need.",
        "Level 3": "Produces a polished, conceptually rich multimedia piece that tells a compelling analytical story. Includes critique, multiple perspectives, design implications, and ethical or equity considerations. The medium deepens the argument rather than simply decorating it."
    },
    "Product D: Create an audio experience": {
        "Level 1": "Creates a clear audio product that introduces the selected trend using 2-3 relevant sources. Accurately explains key terms, why the topic matters, and at least one educational use or implication. The audio format is understandable and organized, though it may rely mostly on summary or narration rather than fully using sound, pacing, voice, or structure to deepen the listener's experience.",
        "Level 2": "Develops a purposeful audio experience with a clear interpretive focus, argument, or guiding question. Synthesizes multiple source types, compares perspectives, and applies the trend to a specific learning environment, population, or instructional problem. Uses audio elements such as narration, interview clips, music, sound design, pacing, or storytelling structure to support meaning and engage the intended audience.",
        "Level 3": "Produces a polished, audience-centered audio experience that uses the strengths of the medium to create insight, emotion, reflection, or critical understanding. Presents a nuanced treatment of the trend, evaluates evidence, critiques assumptions, and addresses tensions such as equity, access, ethics, feasibility, privacy, or unintended consequences. Offers an original interpretation, recommendation, or future-facing insight, with clear attribution and professional-quality organization, sound, and delivery."
    },
    "Product E1: Develop a research poster": {
        "Level 1": "Designs a clear poster that introduces the trend, summarizes key findings or ideas, and identifies major educational implications. Layout is readable and sources are cited.",
        "Level 2": "Organizes the poster around a focused question, problem, or claim. Synthesizes evidence, includes a conceptual framework or practical application, and makes implications for educators or learners explicit.",
        "Level 3": "Creates a conference-ready poster with a strong analytical focus, visual hierarchy, and evidence-based argument. Includes critique, limitations, equity or ethical considerations, and specific recommendations for research, design, or practice."
    },
    "Product E2: Develop an interactive graphic": {
        "Level 1": "Presents key information about the trend in a visually engaging format. Includes basic definitions, examples, and source-based facts or claims.",
        "Level 2": "Uses interactivity to help the audience explore relationships, comparisons, timelines, categories, or decision points. Connects the trend to educational practice and includes multiple source perspectives.",
        "Level 3": "Designs an interactive experience that supports inquiry, analysis, or decision-making. Includes layered evidence, critical tensions, stakeholder perspectives, and implications for responsible or equitable implementation."
    },
    "Product F: Write short-form fiction or poetry": {
        "Level 1": "Creates a short fictional or poetic work that connects clearly to the selected educational technology trend. Uses 2-3 relevant sources to inform the piece, either directly or indirectly, and demonstrates basic understanding of the topic, key terms, and educational implications. The creative work communicates a recognizable idea or scenario, though the connection between the sources, trend, and creative choices may be mostly straightforward or explanatory.",
        "Level 2": "Develops a purposeful short-form fiction or poetry piece that interprets the trend through character, image, voice, metaphor, conflict, setting, or narrative situation. Synthesizes multiple source types and applies the trend to a specific educational context, learner experience, ethical dilemma, or future possibility. The work moves beyond summary by using creative form to reveal implications, tensions, or competing perspectives.",
        "Level 3": "Produces a polished and conceptually rich creative work that uses fiction or poetry to offer a nuanced, original interpretation of the trend. Critiques assumptions, evaluates possible consequences, and explores tensions such as equity, agency, surveillance, access, identity, labor, ethics, or human-machine relationships. The piece demonstrates strong command of craft, audience awareness, and meaningful source-informed insight, even when the sources are not explicitly visible in the creative form."
    },
    "Product G: Create a short graphic novel or a series of strips": {
        "Level 1": "Creates a basic graphic story or series of strips connected to the selected trend, using 2-3 relevant sources. Accurately introduces key ideas, educational implications, or possible uses of the trend. Uses visuals, dialogue, captions, or sequence to communicate the topic, though the story may rely mostly on explanation or summary.",
        "Level 2": "Develops a clear, purposeful graphic narrative with a recognizable audience, setting, conflict, or point of view. Synthesizes multiple sources and applies the trend to a specific learning environment, population, ethical issue, or instructional problem. Uses visual storytelling, character, pacing, and dialogue to show implications rather than simply explain them.",
        "Level 3": "Produces a polished, source-informed graphic narrative that offers a nuanced and original interpretation of the trend. Critiques assumptions and addresses tensions such as equity, access, ethics, privacy, bias, feasibility, or unintended consequences. Demonstrates strong visual organization, audience awareness, accessibility, clear attribution, and meaningful insight beyond summary."
    },
    "Product H: Develop a Game or Gamified Scenario": {
        "Level 1": "Designs a basic game, simulation, or gamified scenario that introduces the selected trend and its educational relevance. Uses 2-3 relevant sources to inform the concept, rules, setting, or learning goals. The product includes a playable or clearly understandable structure, such as roles, objectives, choices, challenges, feedback, or scoring, though the connection between gameplay and the trend may be mostly introductory.",
        "Level 2": "Develops a coherent game or gamified scenario with a clear learning purpose, target audience, and connection to a specific educational setting, population, or instructional problem. Synthesizes multiple source types and translates key ideas from the trend into meaningful gameplay mechanics, decisions, tradeoffs, feedback loops, or role-based interactions. The product encourages players to apply, compare, analyze, or evaluate ideas rather than simply recall information.",
        "Level 3": "Produces a polished, engaging, and conceptually sophisticated game or gamified scenario in which the mechanics, narrative, player choices, and learning goals work together. Critically explores assumptions, evidence, and tensions related to the trend, such as equity, access, ethics, feasibility, motivation, data use, power, or unintended consequences. Offers an original design insight, debrief structure, or recommendation that helps players transfer learning beyond the game experience."
    },
    "Product I: Create a playlist or guide": {
        "Level 1": "Curates a small set of social media posts, threads, videos, or public conversations related to the trend. Provides brief annotations explaining relevance and credibility.",
        "Level 2": "Organizes the playlist around a theme, debate, or question. Compares voices from different stakeholders, such as educators, researchers, students, designers, journalists, or industry leaders.",
        "Level 3": "Critically analyzes the public discourse around the trend. Identifies patterns, omissions, misinformation risks, equity concerns, power dynamics, or competing narratives. Includes a reflective synthesis explaining what the discourse reveals about the future of educational technology."
    },
    "Product J: Create a Social Media Strategy": {
        "Level 1": "Creates a basic social media strategy that explains the selected trend, identifies an intended audience, and uses 2-3 relevant sources to support key messages. Includes appropriate platforms, sample posts or content ideas, and at least one educational implication or call to action. The strategy is understandable and relevant, though it may focus more on sharing information than on audience engagement, sequencing, or strategic communication.",
        "Level 2": "Develops a clear, audience-specific social media strategy with a defined purpose, message, platform rationale, and content plan. Synthesizes multiple source types, compares perspectives, and applies the trend to a particular educational community, learner group, institution, or professional audience. The strategy includes thoughtful choices about tone, format, timing, accessibility, engagement, attribution, and how different posts or media elements work together.",
        "Level 3": "Produces a polished and strategically sophisticated social media plan that communicates a nuanced, source-informed perspective on the trend. Critiques assumptions, evaluates evidence, and addresses tensions such as equity, access, ethics, privacy, misinformation, platform bias, audience trust, or unintended consequences. Includes original messaging, campaign logic, accessibility considerations, and a future-facing recommendation or action plan that demonstrates professional awareness of both educational impact and public communication."
    },
    "Product K: Develop a questionnaire or interview": {
        "Level 1": "Develops a basic set of survey or interview questions that explore awareness, perceptions, or experiences related to the trend. Questions are clear, relevant, and connected to sources.",
        "Level 2": "Designs questions around a specific research purpose or audience. Includes a mix of question types and addresses attitudes, practices, barriers, benefits, and contextual factors.",
        "Level 3": "Produces a rigorous, research-informed instrument or interview protocol. Questions align with a conceptual framework, avoid leading language, account for ethical considerations, and explore complexity across stakeholders, equity, implementation, and future implications."
    },
    "Product L: Develop an assessment": {
        "Level 1": "Develops a basic assessment connected to the selected trend, using 2-3 relevant sources. Identifies what learners should demonstrate and includes appropriate items, prompts, tasks, criteria, or performance expectations. Shows basic topic understanding, though alignment among goals, evidence, and scoring may be uneven.",
        "Level 2": "Develops a clear, purposeful assessment with defined goals, audience, context, and criteria. Synthesizes multiple sources and asks learners to apply, analyze, evaluate, design, or reflect. Shows attention to validity, clarity, fairness, accessibility, and how results could inform learning or instruction.",
        "Level 3": "Produces a polished, well-aligned assessment grounded in sources and suited to a specific context. Demonstrates nuanced understanding of the trend and addresses issues such as equity, bias, accessibility, privacy, feasibility, or learner agency. Includes clear directions, meaningful criteria, and a recommendation for use, revision, or interpretation."
    },
    "Product M: Create a Lesson Plan or Training Outline": {
        "Level 1": "Outlines a short professional development session introducing the trend. Includes learning goals, key content, one activity, and basic resources.",
        "Level 2": "Designs a coherent PD session for a specific educator audience. Includes objectives, activities, discussion prompts, application tasks, and assessment of participant learning.",
        "Level 3": "Creates a robust professional learning experience that supports transfer to practice. Includes differentiated activities, facilitation guidance, ethical or equity considerations, implementation challenges, and follow-up supports or evaluation measures."
    },
    "Product N: Write a review to be published": {
        "Level 1": "Reviews a relevant resource, such as an article, tool, podcast, report, video, or website. Summarizes the resource, identifies its main claims, and explains its relevance to the trend.",
        "Level 2": "Evaluates the resource's usefulness, credibility, audience, evidence, and application to educational practice. Connects the review to other sources or course themes.",
        "Level 3": "Provides a critical, publication-quality review that analyzes the resource's assumptions, evidence, limitations, and implications. Addresses equity, ethics, accessibility, or broader social consequences and offers a justified recommendation for specific audiences.",
        "Note": "A book review would be classified under products A or B (not Product N)."
    }
}

WORK_EFFORT_GUIDANCE = """
For your work effort score, when you self-assess, consider factors like the amount of effort put into:
 - creative thought & conceptualization process
 - the initial design or development stages
 - the work of creating or building the artifact
 - reflecting on the effort as you went along
 - refining and/or revising the artefact
 - putting on any finishing touches
"""

def parse_artifacts():
    try:
        with open(INDEX_FILE, 'r', encoding='utf-8') as f:
            content = f.read()
    except FileNotFoundError:
        print(f"Error: {INDEX_FILE} not found.")
        return []
    
    artifacts = []
    articles = re.findall(r'<article[^>]*class="[^"]*artifact-card[^"]*"[^>]*>(.*?)</article>', content, re.DOTALL)
    for art in articles:
        title_match = re.search(r'<h3>(.*?)</h3>', art)
        title = title_match.group(1).strip() if title_match else "Unknown"
        
        desc_matches = re.findall(r'<p>(.*?)</p>', art, re.DOTALL)
        desc = "Unknown"
        for d in desc_matches:
            if not "AI involvement" in d and not d.startswith("<i>"):
                desc = d.strip()
                break
                
        artifacts.append({"title": title, "description": desc})
    return artifacts

def load_state():
    if os.path.exists(STATE_FILE):
        with open(STATE_FILE, 'r') as f:
            try:
                return json.load(f)
            except:
                pass
    return {}

def save_state(state):
    with open(STATE_FILE, 'w') as f:
        json.dump(state, f, indent=2)

def prompt_choice(prompt_text, options_dict, guidance_text=None):
    options = list(options_dict.keys()) if isinstance(options_dict, dict) else options_dict
    
    print(f"\n{prompt_text}")
    if guidance_text:
        print(f"\nGUIDANCE:\n{guidance_text}\n")
    for i, opt in enumerate(options, 1):
        print(f"  {i}. {opt}")
        
    while True:
        try:
            choice = input(f"Select (1-{len(options)}) [type 'q' to quit]: ").strip()
            if choice.lower() == 'q':
                return None
            idx = int(choice) - 1
            if 0 <= idx < len(options):
                return options[idx]
        except ValueError:
            pass
        print("Invalid choice, please try again.")

def generate_markdown(artifacts, state):
    lines = [
        "# EDTECH569 Portfolio Grading Summary\n",
        "| Artifact | Product Type | Genre | Level | Work Effort | Satisfaction | Time | Score |",
        "|---|---|---|---|---|---|---|---|"
    ]
    total_score = 0
    product_type_counts = {}
    for art in artifacts:
        title = art["title"]
        if title not in state:
            continue
        data = state[title]
        product_type_counts[data.get("product_type", "")] = product_type_counts.get(data.get("product_type", ""), 0) + 1
        score = sum([
            PRODUCT_TYPES.get(data.get("product_type", ""), 0),
            GENRES.get(data.get("genre", ""), 0),
            WORK_EFFORT.get(data.get("work_effort", ""), 0),
            SATISFACTION.get(data.get("satisfaction", ""), 0),
            TIME_SPENT.get(data.get("time_spent", ""), 0)
        ])
        total_score += score
        lines.append(f"| {title} | {data.get('product_type')} | {data.get('genre')} | {data.get('level')} | {data.get('work_effort')} | {data.get('satisfaction')} | {data.get('time_spent')} | {score:.2f} |")

    lines.append(f"\n**Total Score: {total_score:.2f} / 300+**\n")

    lines.append("## Portfolio Requirements (per Choice Board sheet)\n")
    unique_types = len(product_type_counts)
    lines.append(f"- Unique product types used: {unique_types} (need 5+) — {'OK' if unique_types >= 5 else 'NOT MET'}")
    lines.append(f"- Total points: {total_score:.2f} (need 300+) — {'OK' if total_score >= 300 else 'NOT MET'}")
    repeated = [f"{pt} (x{n})" for pt, n in product_type_counts.items() if n > 2]
    if repeated:
        lines.append(f"- Product types used more than twice (choice board says max 2x each): {', '.join(repeated)}")
    else:
        lines.append("- No product type repeated more than twice — OK")

    with open(OUTPUT_FILE, 'w') as f:
        f.write("\n".join(lines))
    print(f"\nSuccessfully generated {OUTPUT_FILE} with total score {total_score:.2f}.")

def main():
    print("="*60)
    print(" Welcome to the EDTECH569 Portfolio Grading TUI ")
    print(" Your progress is automatically saved to grades_state.json")
    print("="*60)
    
    artifacts = parse_artifacts()
    if not artifacts:
        print("No artifacts found in index.html.")
        return
        
    state = load_state()
    
    for art in artifacts:
        title = art["title"]
        print(f"\n\n--- Artifact: {title} ---")
        print(f"Description: {art['description']}\n")
        
        if title in state:
            score = sum([
                PRODUCT_TYPES.get(state[title].get("product_type", ""), 0),
                GENRES.get(state[title].get("genre", ""), 0),
                WORK_EFFORT.get(state[title].get("work_effort", ""), 0),
                SATISFACTION.get(state[title].get("satisfaction", ""), 0),
                TIME_SPENT.get(state[title].get("time_spent", ""), 0)
            ])
            print(f"Status: Already graded (Score: {score:.2f})")
            ans = input("Do you want to re-grade this artifact? (y/N) [type 'q' to quit]: ").strip().lower()
            if ans == 'q':
                return
            if ans != 'y':
                continue
                
        art_state = {}
        
        pt = prompt_choice("Product Type:", PRODUCT_TYPES)
        if not pt: return
        art_state["product_type"] = pt
        
        gen = prompt_choice("Genre:", GENRES)
        if not gen: return
        art_state["genre"] = gen
        
        # Build guidance for levels based on selected product type
        lvl_guidance = None
        if pt in PRODUCT_LEVEL_GUIDANCE:
            l = PRODUCT_LEVEL_GUIDANCE[pt]
            lvl_guidance = f"Level 1: {l['Level 1']}\nLevel 2: {l['Level 2']}\nLevel 3: {l['Level 3']}"
            if "Note" in l:
                lvl_guidance += f"\nNote: {l['Note']}"
            
        lvl = prompt_choice(f"Level of Effort for {pt}:", LEVELS, guidance_text=lvl_guidance)
        if not lvl: return
        art_state["level"] = lvl
        
        eff = prompt_choice("Rate Your Work Effort:", WORK_EFFORT, guidance_text=WORK_EFFORT_GUIDANCE.strip())
        if not eff: return
        art_state["work_effort"] = eff
        
        sat = prompt_choice("Rate Your Satisfaction:", SATISFACTION)
        if not sat: return
        art_state["satisfaction"] = sat
        
        time = prompt_choice("Time Spent:", TIME_SPENT)
        if not time: return
        art_state["time_spent"] = time
        
        state[title] = art_state
        save_state(state)
        print(f"\n[+] Saved grades for '{title}'")
        
    print("\nAll artifacts graded!")
    generate_markdown(artifacts, state)

if __name__ == "__main__":
    main()
