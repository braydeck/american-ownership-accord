---
name: survey-analysis
description: "Analyze survey data — both quantitative (closed questions, Likert scales, multiple choice) and qualitative (open-ended questions) — to surface patterns, insights, and recommendations. Use this skill when a researcher has survey results and needs to analyze them, wants to combine quant and qual survey findings, needs to write open-ended survey questions that actually get responses, or wants to structure a survey report. Triggers include: 'analyze survey', 'survey analysis', 'open-ended survey questions', 'how do I analyze survey data', 'survey results', 'qualitative survey analysis', 'quantitative survey analysis', 'survey findings', 'how do I write open-ended questions', 'survey report', 'cross-tabulation', 'survey patterns', 'thematic analysis survey', 'bayesian survey analysis', 'confidence interval', 'credible interval', 'bootstrap', 'signal strength', 'uncertainty', 'small sample size', 'how confident should I be in survey results', 'compare two groups survey', 'is this difference real'."
version: 2.0
author: The User Research Strategist
---

# Survey Analysis

This skill analyzes survey data — writing open-ended questions that get responses, analyzing both quantitative and qualitative data with honest uncertainty quantification, and structuring findings into a usable report.

## Surveys as a mixed-methods tool

Surveys are typically thought of as quantitative — numbers, percentages, Likert scales. But with careful planning, surveys can also produce rich qualitative data through open-ended questions. When combined, the two give you scale (how many?) and texture (why?).

The most common failure modes:
- Open-ended questions nobody fills out (usually a framing problem)
- Closed questions that tell you what happened but not why
- Analysis that stops at percentages without quantifying uncertainty — treating "30% from 50 respondents" the same as "30% from 500 respondents"
- Reports that present raw data rather than findings tied to research goals

---

## Why Bayesian methods for survey analysis

Most survey research in UX and brand work operates with small, variable sample sizes — 20 to 200 respondents per cell is typical. At these sizes, standard frequentist significance testing is misleading: a real and meaningful effect will routinely fail to reach p<0.05, and researchers are left declaring "no significant difference" when the honest answer is "we don't have enough data to tell."

Bayesian methods solve this by reporting **credible intervals** (the range where the true value probably lies) and **directional probabilities** (e.g., "there is a 92% chance Group B's rate is higher than Group A's"). This lets you say "directionally strong but not conclusive" instead of forcing a binary significant/not-significant verdict.

**The practical payoff:**
- A percentage without a credible interval is incomplete. "32% of respondents selected X" becomes "32% [95% CI: 22%–43%]" — which tells the reader the estimate is wide and uncertain.
- A group comparison without a probability is incomplete. "Group A scored higher than Group B" becomes "P(A > B) = 0.91" — which tells the reader there's a 91% chance this direction is real.
- Signal strength labels translate these numbers into plain language that stakeholders can act on without needing to interpret intervals themselves.

**When Bayesian vs. frequentist:**

| Sample size per group | Recommended approach | Why |
|---|---|---|
| < 50 | Bayesian (posteriors + credible intervals) | Frequentist CIs are too wide to be useful; p-values almost never reach significance even for real effects |
| 50–150 | Bayesian preferred, frequentist acceptable | Bayesian gives richer output; frequentist tests have marginal power |
| 150+ | Either works; frequentist is faster for quick directional checks | Adequate power for standard tests; Bayesian still provides richer uncertainty communication |

Default to Bayesian unless sample sizes are large and the goal is a quick directional screen across many comparisons.

---

## Part 1: Writing open-ended survey questions that get responses

### Think about the goal first

Surveys are excellent for gauging large-scale behavior, preferences, and prioritization. They rarely give you enough depth to understand motivations or emotional context alone — that's what interviews are for.

Use open-ended questions when: you want the root of a behavior, the reason behind a preference, or the texture behind a trend the closed questions surfaced.

Use interviews when: you need to understand the full context, follow unexpected threads, or build genuine empathy.

### Common traps to avoid

**Leading questions:** Subjective or positive framing that pushes people toward a particular answer.

Leading: "How satisfied are you with our stationery?"
Not leading: "How do you feel about our stationery?" (scale: Very unsatisfied → Very satisfied)

**Double-barrelled questions:** Two questions joined by "and" — people answer one part and ignore the other.

Double-barrelled: "Which stationery companies do you use and what do you think about them?"
Fixed:
- "What other stationery companies do you use?"
- "How do you feel about your most recent purchase at another stationery company?"

**Future-based behavior questions:** People can't reliably predict their own future behavior. Past behavior is your proxy for future behavior.

Future-based: "How often will you order birthday cards each year?"
Past-based: "Last year, how many times did you order birthday cards?"

### The 60/40 rule

Don't make every question open-ended. Response rates are better with a mix. Use approximately 60% closed questions and 40% open-ended.

**Example — stationery survey:**

Research goals: understand what types of stationery people buy most, how they choose, and which competitors they use.

- "What types of stationery did you purchase in the past six months?" [Multiple choice: Birthday, Get well, Thank you, Graduation, Other]
- "What other stationery stores have you purchased from in the past six months?" [Multiple choice with Other open field]
- "Think about your last purchase — how did you decide what stationery to buy?" [Open-ended]
- "What has been the most frustrating experience when purchasing stationery?" [Open-ended]

The closed questions give you scale and category data. The open-ended questions give you the why and the emotional texture.

### Always pilot before sending

Send your survey to 3-5 colleagues (and ideally some relevant friends or family) before launching. Check for confusing questions, leading language, double-barrelled structures, and questions that are too long. A survey with problems that needs resending is one of the worst research feelings.

---

## Part 2: Analyzing quantitative survey data

### Step 1: Compile the data

Export all responses into a spreadsheet (Google Sheets or Excel). Structure it with one column per question and one row per response. Label each question column clearly.

Most survey tools (Typeform, SurveyMonkey, Qualtrics) export directly to a spreadsheet format. Use this rather than copying manually — manual entry introduces errors.

---

### Step 2: Clean the data

Before analysis, remove or correct:
- **Duplicate responses** (same participant submitted twice)
- **Incomplete entries** (respondents who abandoned partway — decide whether to include partial responses based on how complete they are)
- **Nonsensical outliers** (text entered in a numerical field, obvious troll responses)
- **Speeders** (respondents who completed in a fraction of the expected time — likely not reading the questions)

Clean data before you run any analysis. Dirty data produces misleading results.

---

### Step 3: Descriptive statistics with uncertainty

Start with descriptive statistics to get a general sense of the data. **Every quantitative finding should include an uncertainty estimate** — a point estimate without one is incomplete.

**For proportions (multi-select, yes/no, categorical data) — use Beta-Binomial posteriors:**

When you observe k respondents selecting an option out of n total, the raw percentage (k/n) has no uncertainty attached. A Beta-Binomial posterior fixes this. Start with a uniform prior — Beta(1, 1) — which assumes nothing about the true rate. After observing the data, the posterior is:

```
posterior ~ Beta(k + 1, n - k + 1)
```

Report the posterior median as the point estimate and the 2.5th–97.5th percentiles as the 95% credible interval. A 95% credible interval means: given the data observed, there is a 95% probability the true rate lies within this range.

❌ "32% of respondents selected Feature X"
✅ "32% selected Feature X [95% CI: 22%–43%, n=50]"

The credible interval communicates that 32% from 50 respondents is meaningfully less certain than 32% from 500 respondents, and it forces the reader to see the uncertainty before acting.

**For means (Likert scales, rating data) — use bootstrap resampling:**

Rating scale data (e.g., 1–7 Likert) is bounded, potentially skewed, and often comes from small samples. Bootstrap resampling handles all of these without distributional assumptions.

The procedure:
1. Collect all responses for the question.
2. Draw 5,000–10,000 bootstrap resamples (sampling with replacement from the observed scores).
3. Compute the mean of each resample.
4. Report the observed mean plus the 3rd and 97th percentiles of the bootstrap means as the credible interval.

❌ "Average satisfaction score: 4.8 out of 7"
✅ "Average satisfaction: 4.8 [CI: 4.3–5.2, n=45]"

The bootstrap CI tells you how stable the mean is. If it's wide (e.g., 3.9–5.7), the mean is not trustworthy at this sample size.

**For standard category percentages:**
- Calculate the percentage of respondents who selected each option: (count for option ÷ total responses) × 100
- Always include the raw count and total alongside the percentage

---

### Step 4: Analyze individual questions

**Categorical data (multiple choice, yes/no, Likert):**
Calculate the Beta posterior for each option's endorsement rate. Report posterior median and 95% credible interval.

Example — vintage clothing era preferences (50 respondents):
- 1920s: 10/50 = 20% [95% CI: 11%–33%]
- 1950s: 15/50 = 30% [95% CI: 19%–43%]
- 1970s: 20/50 = 40% [95% CI: 27%–54%]
- 1980s: 5/50 = 10% [95% CI: 4%–22%]

Interpretation: The 1970s is the most popular era, but the credible intervals for 1950s and 1970s overlap substantially — we cannot confidently say 1970s is more popular than 1950s at this sample size. The 1980s is clearly the least popular — its CI doesn't overlap with any other category.

**Numerical/rating data:**
Calculate mean, median, and bootstrap CI. Average alone can mislead when responses are polarized (many 1s and 5s on a 5-point scale produce the same average as many 3s — but these represent very different response distributions). Always check the distribution shape alongside the mean.

---

### Step 5: Comparing groups — Monte Carlo posterior differences

When comparing two groups (segments, time periods, experimental conditions), do not just compare point estimates. A group with 35% and another with 28% might look different, but with n=40 per group, the credible intervals overlap heavily and the "difference" could be noise.

**The procedure:**

1. Compute each group's Beta posterior: Group A ~ Beta(k_A + 1, n_A - k_A + 1), Group B ~ Beta(k_B + 1, n_B - k_B + 1)
2. Draw 10,000–50,000 samples from each posterior
3. Compute the difference: diff = draws_B - draws_A
4. Report:
   - **Mean difference**: the expected delta between groups
   - **95% credible interval of the delta**: if this excludes zero, the difference is credible
   - **P(B > A)**: the fraction of draws where B exceeds A — a direct probability statement

P(B > A) = 0.97 means: given the data, there is a 97% chance Group B's true rate is higher than Group A's. This is directly actionable — unlike a p-value, which answers "if the null is true, how surprising is this data?" rather than "how confident should we be in this direction?"

**For comparing means (Likert, rating scales):** Use the same logic but with bootstrap resamples instead of Beta draws. Draw bootstrap means from each group, compute the difference distribution, report P(B > A) and the CI of the delta.

---

### Step 6: Signal strength — translating statistics into plain language

Credible intervals and directional probabilities are rigorous but not immediately readable by stakeholders. Translate them into signal strength labels.

**For group comparisons (using directional probability):**

| P(B > A) | Signal strength | What to say in a report |
|---|---|---|
| ≥ 0.95 | Strong evidence | "Group B is clearly higher than Group A" |
| 0.90–0.95 | Moderate evidence | "Group B is likely higher — directionally strong but not conclusive" |
| 0.80–0.90 | Directional | "Group B appears higher, but we need more data to be confident" |
| < 0.80 | Inconclusive | "No meaningful difference detected at this sample size" |

**For bipolar scores (satisfaction, ease — scales with a natural zero/midpoint):**

When scores are rescaled to -1 (negative) to +1 (positive), use the credible interval's relationship to zero and the magnitude of the mean:

| CI crosses zero? | Mean magnitude | Signal | Label |
|---|---|---|---|
| No | ≥ 0.4 | Strong | "Clearly positive" or "Clearly negative" |
| No | < 0.4 | Moderate | "Likely positive" or "Likely negative" |
| Yes | ≥ 0.15 | Weak | "Possibly positive" or "Possibly negative" |
| Yes | < 0.15 | None | "Mixed signal" |

**For frequency/endorsement rates (proportion data with a natural 50% midpoint):**

When interpreting whether an endorsement rate is meaningfully above or below the midpoint:

| CI crosses 0.5? | Distance from 0.5 | Signal | Label |
|---|---|---|---|
| No | ≥ 0.2 | Strong | "Clearly high" or "Clearly low" |
| No | < 0.2 | Moderate | "Likely high" or "Likely low" |
| Yes | ≥ 0.075 | Weak | "Possibly high" or "Possibly low" |
| Yes | < 0.075 | None | "Mixed signal" |

**Use signal strength labels in report summaries and executive readouts.** Include the underlying numbers (CI, P-value) in the detailed findings for anyone who wants to inspect them.

---

### Step 7: Podium probabilities for multi-select ranking

When analyzing multi-select data (e.g., "which features matter most?" or "which brand attributes do you associate with us?"), raw endorsement counts produce a rank order — but they don't tell you how confident you should be in that ranking. The item with the most mentions might not truly be #1 if its count is close to the runner-up and both have wide credible intervals.

**Podium probabilities answer: "What is the probability that each item truly ranks #1, #2, or #3?"**

The procedure:
1. For each item, compute its Beta posterior based on endorsement count and total respondents: Beta(count + 1, n - count + 1)
2. Draw 10,000 samples from each item's posterior simultaneously
3. In each draw, rank the items by their sampled rates
4. Tally how often each item lands in each rank position across all draws
5. Report the probability of each item being #1, #2, #3

**Example — feature prioritization survey (80 respondents):**

| Feature | Mentions | Raw % | P(#1) | P(#2) | P(#3) |
|---|---|---|---|---|---|
| API reliability | 42 | 53% | 0.62 | 0.25 | 0.10 |
| Documentation quality | 38 | 48% | 0.28 | 0.40 | 0.22 |
| Onboarding speed | 35 | 44% | 0.08 | 0.28 | 0.38 |
| Pricing transparency | 30 | 38% | 0.02 | 0.07 | 0.25 |

Interpretation: API reliability is the most likely #1 priority (62% probability), but there's a 28% chance documentation quality is actually the top priority — the counts are close enough that the ranking isn't certain. Pricing transparency is almost certainly not in the top 2, but has a 25% chance of being #3.

**When to use podium probabilities:** Any time you're presenting a ranked list from survey data and the top items have similar endorsement rates. Podium probabilities prevent false precision in rankings — saying "Feature A is our users' #1 priority" when it edged out Feature B by 3 percentage points in a sample of 80.

---

### Step 8: Cross-tabulation

Cross-tabulation compares how different groups responded to the same question — revealing patterns that aggregate data hides.

**When to use it:** When you suspect a finding differs between segments (age groups, personas, usage frequency, demographics).

**How it works:** Create a table where rows represent one variable (e.g., age group) and columns represent another (e.g., purchasing frequency). Each cell shows the count or percentage for that combination.

**Example — vintage clothing purchasing frequency by age:**

| Age group | Monthly+ | Every few months | Rarely |
|---|---|---|---|
| 18-34 | 45% | 35% | 20% |
| 35-44 | 30% | 40% | 30% |
| 45-54 | 15% | 35% | 50% |

Interpretation: Younger shoppers (18-34) purchase vintage clothing far more frequently than older groups. The 45-54 group rarely purchases — potentially a different use case or acquisition opportunity.

**Apply uncertainty to cross-tabs:** When cell sizes are small (which they usually are once you segment), add credible intervals or Monte Carlo group comparisons. A 15-percentage-point difference between segments based on 20 respondents per cell is much less trustworthy than the same difference based on 200 per cell. Use the sample size / detectable delta table below to calibrate expectations.

---

### Step 9: Look for correlations and patterns

After analyzing individual questions, look for relationships between them.

**Correlations:** Does frequency of purchase correlate with a particular motivation? Does satisfaction score correlate with age group or product type?

**Seasonal or longitudinal patterns:** If you have data from multiple time points (e.g., a recurring survey), compare responses over time to identify trends.

**Segmentation:** Break data down by key demographic or behavioral segments. "Users who purchase monthly" may show very different patterns than "users who purchase rarely."

Tools: Excel pivot tables and conditional formatting for basic correlation analysis. SPSS or R for statistical significance testing. Python (scipy.stats.beta, numpy) for Bayesian posteriors and Monte Carlo comparisons. Google Sheets with custom functions for Bootstrap CIs and proportion CIs. Dovetail or Airtable for tagging and segmenting.

---

### What your sample size can and cannot detect

Before interpreting any comparison, check what effect size your data can actually resolve:

| n per group | 95% CI width (~50% rate) | Minimum detectable delta |
|---|---|---|
| 20 | ±23 percentage points | ~30pp or more |
| 50 | ±14pp | ~18pp or more |
| 100 | ±10pp | ~13pp or more |
| 200 | ±7pp | ~9pp or more |
| 500 | ±4pp | ~6pp or more |

Most UX and brand research cells have 20–100 respondents. This means deltas of 15–20+ percentage points can be detected, but deltas of 5–10pp will show up in the data without reaching credible significance. Don't dismiss small directional differences — flag them as "directional, needs larger sample" rather than "no difference found."

**Pooling for power:** If you have data across multiple time periods or closely related segments, consider pooling them into larger groups (e.g., "2023 + 2024" vs. "2025 + 2026") to double the effective n per comparison. This trades within-period granularity for tighter credible intervals on the comparison that matters most.

---

## Part 3: Analyzing open-ended survey responses

Open-ended responses are analyzed the same way as qualitative interview data — just at higher volume and without the richness of in-person context.

### The 5-step process

**Step 1: Skim for themes**
Read through all responses to get a general sense before tagging anything. Jot down the themes you notice appearing repeatedly. This gives you preliminary project-based tags to work with in step 2.

**Step 2: Develop tags**
Use a combination of:
- **Global tags** (pain point, motivation, goal, need, task) — the same set used in affinity diagramming
- **Project-based tags** derived from what you spotted in step 1 — specific to this survey's topic

**Example — stationery survey:**
After skimming, preliminary themes noted:
- Question 3 (how did you decide what to buy): people look at their calendar; bulk purchasing for upcoming events; waiting for sales
- Question 4 (most frustrating experience): out of stock items; unclear shipping timelines; shipping delays; product quality disappointment

Project-based tags developed: `bulk-purchase`, `sale`, `planning`, `return-customer`, `lacking-quality`, `shipping-issues`, `out-of-stock`

**Step 3: Tag the raw responses**
Go back through each response and tag it. One response can receive multiple tags — just like transcript lines.

Example:
"I tend to wait for a sale to purchase a bunch of stationery at once because it is cheaper. I look at my calendar and think, what do I have coming up in the next six months, and buy all the birthday or celebration cards I think I will need."
→ Tags: `#goal` `#motivation` `#planning` `#bulk-purchase` `#sale`

"It turns out the shipping took about four weeks, then was delayed, so half the cards were useless by the time they arrived and I had to go out to another store."
→ Tags: `#pain-point` `#shipping-issues` `#goal`

**Step 4: Tally the most common project-based tags**
Count how many responses received each tag. The top 3 project-based tags by frequency become your primary findings to report on.

**Apply uncertainty here too:** If 28 out of 80 open-ended responses mentioned shipping issues, that's a 35% mention rate — but the 95% CI is [25%–46%]. Report the CI alongside the tag frequency, especially when presenting to stakeholders who will want to know how reliable the number is.

In the stationery example:
1. `shipping-issues` — most frequently mentioned
2. `sale` — bulk purchasing triggered by sales
3. `planning` — six-month forward planning for events

**Step 5: Pull supporting quotes**
For each primary finding, select 2-3 verbatim quotes that represent the finding. Quotes bring insights to life and remind colleagues that users are real people with real problems.

---

### Three analytical approaches for open-ended data

**Thematic analysis (most common):**
Identify recurring patterns and themes across responses. Code responses under theme categories. Analyze frequency and context. Produces rich, textured findings.

Best for: understanding why something is happening, surfacing unexpected patterns, smaller open-ended datasets.

**Content analysis (more structured):**
Count the frequency of specific words, phrases, or concepts. More systematic and quantifiable than thematic analysis — allows you to report "42% of responses mentioned shipping delays."

Best for: larger datasets, when you need to quantify qualitative themes for skeptical stakeholders, when you want to prioritize across many topics.

**Comparative analysis:**
Compare open-ended responses across different segments of your survey respondents. Do younger users describe frustrations differently from older users? Do heavy users mention different pain points than light users?

Best for: when you have meaningful demographic or behavioral segments and want to understand if the qualitative themes differ across them.

---

## Part 4: Structuring the survey report

Tie every finding back to the original research goals. A report that presents raw percentages without connecting them to what the team needs to decide is not a research report — it's a data dump.

**Report structure:**

For each research goal:
1. Goal title
2. Finding summary (1-3 sentences, using signal strength labels)
3. Finding 1 directly related to the goal
   - Evidence (percentage with CI, probability statement, quote, or cross-tabulation)
4. Finding 2 directly related to the goal
   - Evidence
5. Finding 3 if applicable
   - Evidence

**Recommendations:** For every significant finding, include a pointed recommendation. Don't leave teams to figure out what to do with the data. Even if the recommendation is obvious, state it — it gives teams a starting point.

**Visuals:** Charts for percentage data (with error bars showing credible intervals), tables for cross-tabulation, verbatim quotes for qualitative findings. One visual per finding is enough — more than that dilutes attention.

**Include a "What this analysis can and cannot tell you" section:**

*This analysis can tell you:*
- [Posterior estimates with credible ranges for each metric]
- [Which group differences are directionally strong and which are inconclusive]
- [The most common themes in open-ended responses]

*This analysis cannot tell you:*
- [Causation — a correlation between two variables does not mean one causes the other]
- [The experience of segments not represented in the sample]
- [Why — quantitative patterns identify what is happening; interviews reveal why]
- [Precision beyond the sample size — credible intervals are wide when n is small, and no analysis can manufacture certainty that isn't in the data]

---

## Output options

When someone triggers this skill:

1. **Open-ended question writer** — given survey goals, write open-ended questions that avoid leading, double-barrelled, and future-based framing, balanced with appropriate closed questions
2. **Quantitative analysis plan** — given a survey structure and goals, outline the Bayesian posteriors, bootstrap CIs, group comparisons, and signal strength assessments to run
3. **Open-ended analysis** — given a set of open-ended survey responses, skim for themes, develop tags, tag the responses, identify the top findings with uncertainty estimates, and pull supporting quotes
4. **Group comparison** — given two segments from a survey, compute Monte Carlo posterior differences, report P(B > A), signal strength labels, and credible interval of the delta
5. **Podium probability ranking** — given multi-select endorsement counts, compute and report the probability that each item truly ranks #1, #2, #3
6. **Cross-tabulation design** — given two variables from a survey, design the cross-tab table with credible intervals and explain what to look for in the results
7. **Survey report structure** — given research goals and a set of findings, write a structured report outline with goal-finding-evidence format, signal strength labels, and a "what this can/cannot tell you" section

---

## Researcher reminders

- Surveys tell you what and how many; open-ended questions add why — you need both for a complete picture
- The 60/40 rule: 60% closed, 40% open-ended — all open-ended kills response rates
- Always ask about past behavior, never future behavior — people can't reliably predict what they'll do
- Pilot every survey with 3-5 colleagues before sending — problems are always more obvious to a fresh reader
- Clean the data before running any analysis — dirty data produces misleading results
- **A percentage without a credible interval is incomplete** — always report uncertainty alongside point estimates
- Use Beta posteriors for proportions, bootstrap CIs for means — both are simple to compute and make honest uncertainty visible
- When comparing groups, report P(B > A) as a directional probability rather than (or alongside) p-values — it directly answers the question stakeholders are asking
- Use signal strength labels to translate statistical outputs into language stakeholders can act on
- Use podium probabilities when presenting ranked lists from multi-select data — raw count rankings overstate certainty when top items are close
- Don't stop at aggregate percentages — cross-tabulation is where strategic insight lives, but add credible intervals when cell sizes are small
- Check the detectable-delta table before interpreting any comparison — if your sample can only detect 18pp differences, don't conclude "no difference" from a 10pp gap
- Tag open-ended responses the same way you tag interview transcripts — global tags plus project-based tags
- Top 3 most common project-based tags are your primary findings from open-ended analysis; support each with 2-3 verbatim quotes
- Every finding in the report should tie back to a research goal — if it doesn't connect to a decision the team needs to make, it goes in an appendix
- Surveys are most powerful as part of a mixed-methods approach — use them to generalize or prioritize qualitative findings, not to replace them
- Admitting analytical limitations builds credibility — include "what this analysis can and cannot tell you" in every report