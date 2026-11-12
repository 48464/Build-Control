'use strict';
/* compguide.js — Ethiopian Building Compliance guide (orientation only) and the 16-item checklist used by the Compliance register.
   No article text, fees or deadlines are built in. Each statement carries a label:
   "Confirmed" = found in the text of Proclamation 624/2009 or in reports about it; "To verify" = news, theses or one city's practice. Prepared 12 November 2026. */
(function () {
  window.COMP_CHECKLIST = [
    { t: 'Land title or lease', step: 1 }, { t: 'Planning consent', step: 2 },
    { t: 'Architectural drawings (signed, sealed)', step: 3 }, { t: 'Structural drawings and calculations (signed, sealed)', step: 3 }, { t: 'Electrical and sanitary drawings', step: 3 },
    { t: 'Construction permit', step: 4 }, { t: 'Accessibility check (public buildings)', step: 4 },
    { t: 'Contractor registration and work permit', step: 5 }, { t: 'Contractor insurance for this project', step: 5 }, { t: 'Supervisor appointment letter', step: 5 },
    { t: 'Inspection: foundation', step: 6 }, { t: 'Inspection: structural frame', step: 6 }, { t: 'Inspection: other stages required by the office', step: 6 },
    { t: 'Worker safety equipment and site safety plan', step: 6 }, { t: 'Special permits (night work, road closure, demolition)', step: 6 },
    { t: 'Occupancy permit', step: 7 }
  ];
  const OK = 'ok', V = 'v';
  const FRAMEWORK = [
    ['Ethiopian Building Proclamation No. 624/2009', 'Sets the minimum national standard for constructing or changing a building, or its use, to protect public health and safety. Covers planning consent, plan approval, the construction permit, inspection and occupancy.', 'Urban administrations and their building officers; the federal ministry for urban development and infrastructure', OK],
    ['Building Regulation No. 243/2011 (Council of Ministers)', 'Detailed rules under the proclamation, including duties of professionals and contractors. Reported to require contractors to insure each project.', 'Same offices', V],
    ['Ethiopian Building Code Standards (EBCS)', 'Technical standards for design and construction. A government-linked brief counts fourteen. Examples: EBCS-1 Basis of Design and Actions on Structures; EBCS-2 Structural Use of Concrete; EBCS-3 Steel; EBCS-4 Composite; EBCS-10 Electrical Installation; EBCS-14 Health and Safety.', 'Building officers when checking plans and inspecting', OK],
    ['Building directives', 'Practical directives that implement the proclamation, for example on safety in excavations.', 'Urban administrations', V],
    ['Urban land lease and registration laws (for example Proclamation No. 721/2011, Regulation No. 49/2012)', 'Govern how urban land is held and leased, which affects the proof of land rights you need.', 'Urban land administration offices', V],
    ['Environmental Pollution Control Proclamation No. 300/2002', 'General framework on pollution and waste that can apply to construction sites.', 'Environmental authorities', V],
    ['City permit authorities (for example the Addis Ababa Construction Permit and Control Authority)', 'Issue permits, inspect, and issue occupancy permits in their city. Procedures are published locally.', 'The authority itself', V]
  ];
  const STAGES = [
    ['Proof of land rights', 'Show the right to use the plot, for example a title or lease. If you are developing for sale (real estate), extra rules on capital, ownership proof and no resale before completion have been reported.', V, 'Compliance: land title or lease. Files: copy.'],
    ['Planning consent', 'Anyone intending to build must secure planning consent before applying for a construction permit (Article 5).', OK, 'Compliance: planning consent, reference, date.'],
    ['Design by professionals', 'Plan documents are submitted signed and sealed. Use licensed architects and engineers for each discipline.', OK, 'Design & Drawings: upload each drawing and revision.'],
    ['Plan review and construction permit', 'A building officer checks the plans against the proclamation and other laws. An approved plan constitutes the construction permit (Articles 6 and 9).', OK, 'Compliance: building permit, reference, expiry.'],
    ['Contractor and supervision', 'Use a registered contractor holding a work permit from the relevant authority. Contractors are reported to need insurance for each project. Starting work without supervision has led to penalties in Addis Ababa.', V, 'Compliance: contractor licence, insurance, supervisor appointment.'],
    ['Construction and inspection', 'Inspections happen at stages that depend on the building type. Get the list of required inspection stages from the authority before you start. Do not alter approved plans without approval.', V, 'Quality & Safety: inspections linked to each stage.'],
    ['Occupancy permit', 'A completed building is inspected and an occupancy permit is issued before the building is used.', V, 'Compliance: occupancy permit, date, reference.']
  ];
  const OTHER = [
    ['Accessibility', 'Public buildings must have a means of access suitable for people with physical impairments, including wheelchair users. Checked at permit approval.', OK],
    ['Night work', 'Addis Ababa reforms reported a special permit for construction after daylight, and separate requirements for demolition. Check whether your city has the same.', V],
    ['Time limits', 'Permits can lapse if construction is not completed in time. Ask for the validity period and the renewal process.', V],
    ['Scope', 'The proclamation applies to buildings in urban centres and some other types. Outside a town, ask the woreda or zonal office which rules apply.', OK],
    ['Design changes', 'Ask how to get approval for a change after the permit, and record the revised drawing as a new revision in Design & Drawings.', V]
  ];
  const SAFETY = [
    ['Enter an excavation deeper than one metre only when its sides are made safe (a directive reported in the press).', V],
    ['Give every worker the protective equipment the work needs. Authorities in Addis Ababa have acted against contractors who did not.', OK],
    ['Inspect scaffolds and formwork before each use and record it.', V],
    ['Keep a first-aid kit on site and a written plan for who calls for help.', V],
    ['Record every incident and near miss in Quality & Safety, with the action taken.', V]
  ];
  const QUESTIONS = [
    'Which standards, and which edition, do you apply to my building type and height?',
    'What do I submit for planning consent, and then for the construction permit? Which drawings and calculations must be signed and sealed, by which licence class?',
    'What does the permit cost, how long does review take, and how long is the permit valid?',
    'Which inspections are mandatory, at which stages, and how do I request each one?',
    'Which contractor and consultant licence classes may work on my building?',
    'Is insurance required, and of what type?',
    'What happens if the design changes after approval?',
    'What do I need for the occupancy permit, and can I use any part of the building before it is issued?',
    'Do I need other approvals, for example for utilities, fire safety, environment or road works?'
  ];
  const TERMS = [
    ['Planning consent', 'Approval that the proposed use and siting fit the urban plan. Needed before the construction permit application.'],
    ['Construction (building) permit', 'Under Proclamation 624/2009, the approved plan itself constitutes the permit to build.'],
    ['Occupancy permit', 'Issued after inspection of the completed building, allowing it to be used.'],
    ['Building officer', 'Official of the urban administration who reviews plans and inspects work.'],
    ['EBCS', 'Ethiopian Building Code Standards: the technical codes for design and construction.'],
    ['Registered contractor', 'A contractor registered and issued a work permit by the relevant authority.']
  ];
  const SOURCES = [
    ['Building Proclamation No. 624/2009 text (copy)', 'Planning consent, plan approval, permit, registered contractor, scope', 'Copy of the gazette. Check the official gazette.', 'https://www.scribd.com/document/465615529/Federal-nigarit-gazeta-doc'],
    ['UNEP Law and Environment Assistance Platform', 'Purpose of the proclamation', 'Legal database summary', 'https://leap.unep.org/en/countries/et/national-legislation/building-proclamation-no-6242009'],
    ['GIZ Sector Brief: Ethiopia Construction', 'Regulation 243/2011 and the fourteen EBCS', 'Development agency report', 'https://giz.de/en/downloads/GBN_SectorBrief_%C3%84thiopien_Construction_E_WEB.pdf'],
    ['The Reporter Ethiopia: Business Requirement draws contractors ire', 'Contractor insurance', 'News report', 'https://www.thereporterethiopia.com/345/'],
    ['Ethiopian Business Review: As Good As No Policy', 'Excavation safety directive', 'News report. Verify the rule.', 'https://ethiopianbusinessreview.net/?p=10309'],
    ['Addis Fortune: permit and enforcement reports', 'Night-work permit, enforcement on supervision and safety equipment', 'News about Addis Ababa. Verify locally.', 'https://addisfortune.news/city-gloss-over-buildings-paint-reform'],
    ['Addis Ababa University article on inspection and occupancy permits', 'Inspection and occupancy permit services', 'Academic study', 'https://ejol.aau.edu.et/index.php/ajold/article/download/12642/9041'],
    ['Disability in: accessibility summary', 'Accessibility of public buildings', 'Secondary summary', 'https://disabilityin.org/?p=24320'],
    ['Mehrteab Eul law firm: real estate', 'Land lease and related proclamations', 'Law firm summary', 'https://mehrteableul.com/index.php/real-estate'],
    ['Ecolex: Ethiopia legislation', 'Environmental Pollution Control Proclamation No. 300/2002', 'Legal database', 'https://www.ecolex.org/details/legislation/council-of-ministers-regulation-to-provide-the-code-of-practice-of-the-floriculture-sector-no-2072011-lex-faoc121674/']
  ];
  const tag = k => `<span class="ctag ${k}">${k === OK ? 'Confirmed' : 'To verify'}</span>`;
  const sec = (title, inner, open) => `<details class="card" ${open ? 'open' : ''}><summary><b>${title}</b></summary><div style="margin-top:8px">${inner}</div></details>`;

  function view() {
    const g = gate('compliance'); if (g) return g;
    const miss = can('compliance', 'e') ? window.COMP_CHECKLIST.filter(x => !pComp().some(c => c.title === x.t)).length : 0;
    return `<a href="#/compliance" class="small muted">← Compliance register</a><h1>⚖️ Compliance guide</h1>
    <div class="card small" style="border-left:4px solid var(--accent)"><b>Please read first.</b> This is an orientation guide, not legal advice and not the law. Rules differ between cities and regional states, and permit offices change forms, fees and procedures. Fees, deadlines and document lists are left out on purpose. Confirm every item with the permit office that covers your plot and with your licensed architect or engineer. Prepared 12 November 2026.<br><br>${tag(OK)} found in the text of Proclamation 624/2009 or in reports about it. ${tag(V)} from news, theses or one city's practice: check locally first.</div>
    ${can('compliance', 'e') ? `<div class="card"><b>Checklist</b><p class="small muted">${window.COMP_CHECKLIST.length} items, one per approval or inspection, in the order you meet them. They are headings to fill in, not requirements.</p>${miss ? `<button class="primary sm" data-a="comp-topics">Add the checklist (${miss})</button>` : `<span class="small">All checklist items are in your register.</span> <a class="btn sm" href="#/compliance">Open register</a>`}</div>` : ''}
    ${sec('1. The legal framework', FRAMEWORK.map(([n, w, by, t]) => `<div style="margin:0 0 12px"><b>${esc(n)}</b> ${tag(t)}<div class="small">${esc(w)}</div><div class="small muted">Enforced by: ${esc(by)}</div></div>`).join('') + '<div class="small muted"><b>Which edition of the structural standards?</b> The EBCS series dates from 1995 and was reissued in 2013. A Eurocode-based structural series (ESEN) has also been prepared. Ask your permit office and structural engineer which one applies to your building type.</div>', true)}
    ${sec('2. The stages, in order', STAGES.map(([n, w, t, rec], i) => `<div style="display:flex;gap:10px;margin:0 0 12px"><span class="gnum">${i + 1}</span><div><b>${esc(n)}</b> ${tag(t)}<div class="small">${esc(w)}</div><div class="small muted">Record in EthioBuild: ${esc(rec)}</div></div></div>`).join(''), true)}
    ${sec('3. Other rules to ask about', OTHER.map(([n, w, t]) => `<div style="margin:0 0 10px"><b>${esc(n)}</b> ${tag(t)}<div class="small">${esc(w)}</div></div>`).join(''))}
    ${sec('4. Site safety essentials', '<div class="small muted" style="margin-bottom:8px">EBCS-14 Health and Safety (2013) is the national site-safety standard. Read the current text with your engineer. These are practical minimums.</div>' + SAFETY.map(([w, t]) => `<div class="small" style="margin:0 0 8px">• ${esc(w)} ${tag(t)}</div>`).join(''))}
    ${sec('5. Questions for your permit office', '<ol class="gsteps">' + QUESTIONS.map(q => `<li>${esc(q)}</li>`).join('') + '</ol><div class="small muted">Write the answers in the Note field of the matching register record.</div>')}
    ${sec('6. Words used', TERMS.map(([n, w]) => `<div style="margin:0 0 8px"><b>${esc(n)}</b><div class="small">${esc(w)}</div></div>`).join(''))}
    ${sec('7. Sources and how far to trust them', '<div class="small muted" style="margin-bottom:8px">Searched 12 November 2026. Copies on document-sharing sites are for convenience: check the official Federal Negarit Gazeta or the permit office for the authoritative text.</div>' + SOURCES.map(([n, u, r, url]) => `<div style="margin:0 0 10px"><a href="${esc(url)}" target="_blank" rel="noopener"><u>${esc(n)}</u></a><div class="small">${esc(u)}</div><div class="small muted">${esc(r)}</div></div>`).join(''))}`;
  }
  ROUTES.compguide = view;
})();
