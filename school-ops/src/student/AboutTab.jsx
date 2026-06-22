// Student System — "About": a static plain-English glossary of every number, tab,
// and label in the module. No data fetching. Reuses the module's card design and
// the SAME RiskBadge component as the Early Warning tab so the tiers look identical.

import React from 'react';
import RiskBadge from './RiskBadge';

function Card({ title, children }) {
  return (
    <section className="break-inside-avoid mb-4 bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
      <h2 className="text-base font-bold text-slate-900 mb-3">{title}</h2>
      <div className="text-sm text-slate-600 leading-relaxed space-y-2">{children}</div>
    </section>
  );
}

// "Term — description" bullet with the term emphasized.
function DefItem({ term, children }) {
  return (
    <li>
      <span className="font-semibold text-slate-800">{term}</span> — {children}
    </li>
  );
}

const TIERS = [
  { tier: 'critical', desc: 'Low grades AND (falling behind OR many absences). Highest priority.' },
  { tier: 'attendance_risk', desc: '12 or more days absent this year, whatever the grades. Attendance is an early warning that grades usually follow.' },
  { tier: 'slipping', desc: 'Falling behind expectation (Progress ≤ −1σ) but grades are not low yet. Catch them before they drop.' },
  { tier: 'hidden_gem', desc: 'Improving more than expected (Progress ≥ +1σ). Recognize and learn from these.' },
  { tier: 'on_track', desc: 'No flags.' },
];

export default function AboutTab() {
  return (
    <div className="columns-1 lg:columns-2 gap-4">
      <Card title="What this page is">
        <p>Plain-English definitions of every number, tab, and label in the Student System.</p>
      </Card>

      <Card title="The four summary cards">
        <ul className="space-y-2">
          <DefItem term="Total Students">Students enrolled in the selected academic year.</DefItem>
          <DefItem term="Tracked Cohort">
            Students who were also enrolled the previous year, so their year-over-year growth can be measured.
            New arrivals are excluded (no earlier year to compare).
          </DefItem>
          <DefItem term="At-Risk">
            Students flagged for attention: everyone in the Critical or Attendance Risk tiers.
          </DefItem>
          <DefItem term="Avg Attainment %">
            The average overall grade across students in the selected year. (Overall = the average of a
            student&apos;s subject scores; each subject = the average of its two terms. Blank/&quot;N/A&quot;
            subjects are ignored, never counted as zero.)
          </DefItem>
        </ul>
      </Card>

      <Card title="Attainment vs Progress — read this first">
        <p>These answer two different questions:</p>
        <ul className="space-y-2">
          <DefItem term="Attainment">how high a student scores right now. A snapshot.</DefItem>
          <DefItem term="Progress">
            whether a student is keeping up with where they should be, compared to peers who started at the
            same level.
          </DefItem>
        </ul>
        <p>
          A student can have high attainment but poor progress (slipping from the top), or low attainment but
          strong progress (climbing fast). You need both.
        </p>
      </Card>

      <Card title={'Progress Index and "σ" (sigma)'}>
        <p>σ (sigma) is a unit of &quot;how unusual&quot;, like a z-score. 0 means a student did exactly as expected.</p>
        <p>
          We predict each student&apos;s expected grade this year from their grade last year (across the whole
          cohort), then measure how far above or below that prediction they actually landed — in σ.
        </p>
        <p>
          Why not just use the grade change? A student at 99% can only fall, and a student at 60% has lots of
          room to rise. Raw point-change would punish high scorers and flatter low scorers. The Progress Index
          compares each student only to others who started at the same level, so it is fair.
        </p>
        <p className="font-semibold text-slate-800">How to read it:</p>
        <ul className="space-y-1">
          <li>−1 to +1 → normal, on track</li>
          <li>+1 to +2 → clearly ahead of expectation</li>
          <li>−1 to −2 → clearly behind expectation</li>
          <li>beyond ±3 → an extreme outlier; always worth a personal look (and sometimes a sign of a data-entry error)</li>
        </ul>
      </Card>

      <Card title="Risk tiers">
        <p>A student lands in the first tier whose condition they meet, top to bottom:</p>
        <ul className="space-y-2.5">
          {TIERS.map(({ tier, desc }) => (
            <li key={tier} className="flex flex-col sm:flex-row sm:items-start gap-1.5 sm:gap-2.5">
              <span className="shrink-0">
                <RiskBadge tier={tier} />
              </span>
              <span>{desc}</span>
            </li>
          ))}
        </ul>
        <p>
          &quot;Low grades&quot; means the bottom 25% of the selected year. The 12-absence and bottom-25%
          thresholds can be changed in School Settings.
        </p>
      </Card>

      <Card title="The Signals column">
        <p>
          A short summary of the reasons behind a student&apos;s tier — their Progress in σ, absence count, and
          average — so you can see why they were flagged without opening their profile. Example:{' '}
          &quot;progress −3.0σ; 71 absences; avg 85.0&quot;.
        </p>
      </Card>

      <Card title="Cohort Analysis terms">
        <ul className="space-y-2">
          <DefItem term="Curriculum bottleneck">
            The grade where a subject&apos;s average drops the most as students advance. In this school, English
            drops about 5 points entering Grade 4 — the largest in the school.
          </DefItem>
          <DefItem term="Section equity">
            The gap between the highest- and lowest-scoring sections in the same grade and subject. A gap of 4+
            points is a prompt to investigate, not proof of a problem.
          </DefItem>
          <DefItem term="Term-2 slump">How much a subject&apos;s average falls from Term 1 to Term 2, on average.</DefItem>
          <DefItem term="Absence rate">Days absent ÷ school days.</DefItem>
        </ul>
      </Card>

      <Card title="How the numbers are produced">
        <ul className="space-y-2 list-disc pl-5">
          <li>
            Students are matched across years by their ID number only — never by name or section — so changing
            class never breaks their history.
          </li>
          <li>Averages ignore blank/&quot;N/A&quot; scores; they are never treated as zero.</li>
          <li>All metrics recompute automatically each time a workbook is imported.</li>
          <li>Everything on the page follows the academic year selected at the top.</li>
        </ul>
      </Card>
    </div>
  );
}
