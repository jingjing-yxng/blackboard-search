// Intent Detector — classifies queries to prioritize specific resources

const INTENT_TYPES = {
  PROGRAM_CALENDAR: 'program_calendar',
  CLASS_SCHEDULE: 'class_schedule',
  LOCATION: 'location',
  FACULTY: 'faculty',
  GENERAL: 'general'
};

// Program-wide event keywords
const PROGRAM_EVENTS = [
  'spring break', 'winter break', 'fall break', 'summer break',
  'reading week', 'reading period', 'reading day', 'study day',
  'orientation', 'commencement', 'graduation', 'convocation',
  'semester start', 'semester end', 'semester begin',
  'term start', 'term end', 'term begin',
  'classes start', 'classes end', 'classes begin',
  'last day of class', 'first day of class',
  'holiday', 'holidays', 'vacation',
  'move in', 'move out', 'move-in', 'move-out',
  'course registration', 'add drop', 'add/drop',
  'finals week', 'finals period', 'exam period', 'exam week',
  'academic year', 'school year',
  'spring semester', 'fall semester', 'winter term', 'summer term',
  'national holiday', 'golden week', 'chinese new year', 'spring festival',
  'labor day', 'national day', 'qingming', 'dragon boat', 'mid-autumn',
  'program start', 'program end', 'program begin',
  'welcome week', 'reading recess',
];

// Class-specific event keywords
const CLASS_EVENTS = [
  'midterm', 'mid-term', 'mid term',
  'final exam', 'final paper', 'final project', 'final presentation',
  'homework', 'assignment', 'problem set', 'pset',
  'quiz',
  'paper due', 'essay due', 'project due',
  'presentation',
  'office hours',
  'lecture',
  'grading',
];

// Stop words to ignore during fuzzy course matching
const _INTENT_STOP = new Set([
  'when', 'what', 'where', 'which', 'how', 'does', 'will', 'would',
  'could', 'should', 'have', 'been', 'this', 'that', 'with', 'from',
  'about', 'their', 'there', 'they', 'them', 'just', 'also', 'very',
  'like', 'deadline', 'date', 'time', 'start', 'begin', 'end',
  'next', 'last', 'first', 'final',
]);

const _COURSE_CODE_RE = /\b([A-Z]{2,5})\s*[-]?\s*(\d{3,4})\b/i;
const _WHEN_RE = /\b(when|what date|what time|what day|which date|which day)\b/i;
const _DEADLINE_RE = /\b(deadline|due date|due\b|dates?\s+for)\b/i;
const _WHERE_RE = /\b(where\s+is|where's|where\s+are|where\s+can|location\s+of|how\s+(?:do\s+i|to|can\s+i)\s+(?:get\s+to|find|go\s+to))\b/i;
const _WHO_RE = /\b(who\s+is|who's|who\s+are|tell\s+me\s+about|biography|bio\s+of)\b/i;

function detectIntent(query, resources) {
  const q = query.toLowerCase().trim();

  // --- Direct resource type queries ---
  if (/academic\s+calendar|school\s+calendar/.test(q)) {
    return _calendarIntent();
  }

  // --- Location intent ---
  if (_WHERE_RE.test(q)) {
    return {
      type: INTENT_TYPES.LOCATION,
      boostPatterns: ['schwarzman college 101', 'sc 101', 'college 101', 'campus map'],
      promptHint: 'The student is asking about a location or facility. Prioritize the "Schwarzman College 101" PDF guide which contains campus maps, office locations, and facility information. Answer from its content if available.',
      showAllResults: false
    };
  }

  // --- Faculty / person intent ---
  if (_WHO_RE.test(q)) {
    return {
      type: INTENT_TYPES.FACULTY,
      boostPatterns: ['faculty bio', 'bio book', 'faculty directory', 'faculty'],
      promptHint: 'The student is asking about a person. Prioritize the Faculty Bio Book PDF which contains biographies of all faculty and staff members. Answer from its content if available.',
      showAllResults: false
    };
  }

  // --- Temporal / deadline intent ---
  const isTemporal = _WHEN_RE.test(q) || _DEADLINE_RE.test(q);
  if (!isTemporal) return { type: INTENT_TYPES.GENERAL };

  const courseCode = q.match(_COURSE_CODE_RE);
  const hasProgramEvent = PROGRAM_EVENTS.some(kw => q.includes(kw));
  const hasClassEvent = CLASS_EVENTS.some(kw => q.includes(kw));
  const courseMatch = !courseCode ? _fuzzyMatchCourse(q, resources) : null;

  // Explicit course code → class schedule
  if (courseCode) {
    return _classIntent(courseCode[0].toUpperCase());
  }

  // Explicit program event → program calendar
  if (hasProgramEvent) {
    return _calendarIntent();
  }

  // Fuzzy-matched a course name → class schedule
  if (courseMatch) {
    return _classIntent(courseMatch);
  }

  // Class event keyword but no course identified
  if (hasClassEvent) {
    return {
      type: INTENT_TYPES.CLASS_SCHEDULE,
      courseIdentifier: null,
      boostPatterns: ['syllabus'],
      promptHint: 'The student is asking about a class-specific date or event but did not specify which course. Look for relevant syllabi. If you cannot determine the course, ask which course they mean.',
      showAllResults: false
    };
  }

  // Temporal query with no specific context → default to program calendar
  return _calendarIntent();
}

function _calendarIntent() {
  return {
    type: INTENT_TYPES.PROGRAM_CALENDAR,
    boostPatterns: ['academic calendar'],
    promptHint: 'The student is asking about a program-wide date or event. You MUST include BOTH the Fall Academic Calendar AND the Spring Academic Calendar PDFs in the <results> block (minimum 2 results). The answer could be in either calendar depending on the semester.',
    showAllResults: true
  };
}

function _classIntent(courseIdentifier) {
  return {
    type: INTENT_TYPES.CLASS_SCHEDULE,
    courseIdentifier,
    boostPatterns: ['syllabus', courseIdentifier.toLowerCase()],
    promptHint: `The student is asking about a class-specific date/event for "${courseIdentifier}". Prioritize the syllabus for this course which contains the schedule, assignment dates, and exam dates.`,
    showAllResults: false
  };
}

function _fuzzyMatchCourse(query, resources) {
  // Extract course-like resources (syllabi, course pages)
  const courseResources = resources.filter(r => {
    const t = (r.title || '').toLowerCase();
    return t.includes('syllabus') || r.type === 'course';
  });

  const queryWords = query.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !_INTENT_STOP.has(w));

  if (queryWords.length === 0) return null;

  for (const r of courseResources) {
    const title = (r.title || '').toLowerCase()
      .replace(/syllabus/g, '')
      .replace(/course/g, '')
      .replace(/[-_|:()]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const titleWords = title.split(/\s+/).filter(w => w.length > 3);

    for (const tw of titleWords) {
      for (const qw of queryWords) {
        // Exact word match
        if (tw === qw) return r.title;
        // Substring match (e.g. "econ" in "economics")
        if (tw.length >= 4 && qw.length >= 4) {
          if (tw.includes(qw) || qw.includes(tw)) return r.title;
        }
        // Prefix stem match (e.g. "econom" matches "economics" and "economy")
        if (tw.length >= 5 && qw.length >= 5) {
          const prefixLen = Math.min(tw.length, qw.length) - 2;
          if (prefixLen >= 4 && tw.slice(0, prefixLen) === qw.slice(0, prefixLen)) {
            return r.title;
          }
        }
      }
    }
  }

  return null;
}

// Reorder candidates so intent-matching resources appear first
function applyIntentBoosting(candidates, intent) {
  if (!intent || intent.type === INTENT_TYPES.GENERAL) return candidates;

  const { boostPatterns = [] } = intent;
  const boosted = [];
  const rest = [];

  for (const r of candidates) {
    const title = (r.title || '').toLowerCase();
    if (boostPatterns.some(p => title.includes(p.toLowerCase()))) {
      boosted.push(r);
    } else {
      rest.push(r);
    }
  }

  // For program calendar, ensure both fall & spring calendars sort to top
  if (intent.type === INTENT_TYPES.PROGRAM_CALENDAR) {
    boosted.sort((a, b) => {
      const at = (a.title || '').toLowerCase();
      const bt = (b.title || '').toLowerCase();
      const aCal = at.includes('academic calendar');
      const bCal = bt.includes('academic calendar');
      if (aCal && !bCal) return -1;
      if (!aCal && bCal) return 1;
      return 0;
    });
  }

  // For class schedule, sort matching syllabi first
  if (intent.type === INTENT_TYPES.CLASS_SCHEDULE && intent.courseIdentifier) {
    const cid = intent.courseIdentifier.toLowerCase();
    boosted.sort((a, b) => {
      const at = (a.title || '').toLowerCase();
      const bt = (b.title || '').toLowerCase();
      const aMatch = at.includes(cid) && at.includes('syllabus');
      const bMatch = bt.includes(cid) && bt.includes('syllabus');
      if (aMatch && !bMatch) return -1;
      if (!aMatch && bMatch) return 1;
      return 0;
    });
  }

  return [...boosted, ...rest];
}

if (typeof window !== 'undefined') {
  window.INTENT_TYPES = INTENT_TYPES;
  window.detectIntent = detectIntent;
  window.applyIntentBoosting = applyIntentBoosting;
}
