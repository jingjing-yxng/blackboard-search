// Static knowledge base — manually curated documents not available on Blackboard
// These are always available to the LLM regardless of crawl state

const KNOWLEDGE_BASE = [
  {
    id: 'scsa-budget-2025-2026',
    title: 'SCSA Budget 2025-2026: Overview, Approvals, and Funding Parameters',
    // At least one trigger must match for this entry to activate
    triggers: [
      'budget', 'reimburse', 'reimbursement', 'reimbursed', 'fapiao',
      'scsa budget', 'funding parameter', 'out of pocket', 'oa system',
      'expense', 'expenditure', 'treasurer', 'purchase approval'
    ],
    // Boost terms — raise confidence but don't trigger alone
    keywords: [
      'receipt', 'purchase', 'spending', 'money', 'fund', 'funding', 'cost',
      'scsa', 'approval', 'proposal', 'catering', 'rmb', 'pay', 'paid',
      'fapiao', 'contract'
    ],
    content: `SCSA BUDGET 2025-2026
OVERVIEW AND APPROVALS

The SCSA budget comes from the Student Life segment of the program budget, rather than being fees paid by students, as is the case at many colleges and universities. As such, it is subject to Tsinghua's financial regulations, annual auditing, and the College's risk management and operational requirements.

The SCSA budget comes from the Student Life team, so ALL expenditures must be approved in writing by the designated Student Life team representative(s) prior to purchase. This is to ensure that the expenditures fall within the parameters of purchases that can be reimbursed. Any purchases made without prior approval will not be reimbursed.

The Tsinghua University fiscal year is January to December, so budgeting is as follows:
- Term 1 / September - December: 60,000 RMB ($1,000-9,000)
- Term 2 / January - June: 100,000 RMB
- Sports budget: 3,900

OPERATIONAL GUIDELINES

1. Budget does NOT roll over to the next year (i.e., from December 2025 to January 2026) as Tsinghua budgets are based on the calendar year rather than the academic year.
   - All purchase proposals from student(s) need to be submitted by email to the SCSA representative(s) for initial review. And then the SCSA representative(s) submitted the proposal in OA system for designated Student Life team representative(s) to approve prior to purchase. Approval must be documented in OA system to ensure that the student responsible for the purchase can be reimbursed.
   - The proposal should include the following details:
     * Full name of organizer(s) and THU student ID number
     * Name of the event
     * Date and time of event
     * Venue
     * Estimated number of attendees
     * Event Description, including purpose, itinerary, how it aligns with the program objectives, a brief introduction to any guest institutions or organizations (if applicable)
     * Estimated budget requests (RMB) and cost itemization

2. All purchases should be reviewed by the SCSA, and MUST be approved by SL teams and the college finance team in OA system prior to the actual purchase. Any purchase with no prior approved proposal record in OA system will NOT be reimbursed.

3. Purchasers first pay out of pocket and then request reimbursement.
   - Purchasers requesting reimbursement should provide:
     * Full name and THU ID number of purchaser
     * Official fapiao (receipts) - physical paper fapiao or original e-fapiao
     * Participants name list
     * Breakdown list of the reimbursement amount
     * Sample photo of outfit/jerseys should be provided
     * Transaction history screenshot with Vendor's name (for anything over 1,000 RMB)
   - If actual expenses exceed the estimated budget request, reimbursement for the excess amount is not guaranteed.
   - If the spending amount cannot be confirmed at the time the proposal is made, it is advisable to budget extra for unforeseen expenses.
   - For purchases for amounts over the approved budget request, NO reimbursement will be provided for exceeding 10,000 RMB without a pre-approved contract.

4. The item on the official fapiao must match the actual purchase, and the quantity of items purchased must not exceed the number of items needed (for one vendor).

5. Official fapiao (receipts) need to show Tsinghua University (rather than Schwarzman College) to be eligible for reimbursement, and the correct account code (detailed information will be shared with the SCSA representative(s)).

6. Large purchases (above 10,000 RMB) require three quotes for comparison to make a contract for purchasing. Ensure organizer/purchaser submits proposal far enough in advance and go through the process properly.

7. All "contracts" require both the College Office approvals first and then Tsinghua University approval and seal. Ensure the "contracts" has been submitted for review and sealed in OA system 15 business days before actual purchase.

REIMBURSEMENT PROCESS FLOW:
Proposal from scholars to SCSA -> SCSA approved, and SCSA Treasurer(s) propose in OA system -> SL team and the College Finance Team approve -> Scholars purchase first out of pocket -> Event actually happens -> Scholars request reimbursement from SCSA with fapiao -> SL team and College Finance Team process the reimbursement at THU Finance Center -> SCSA Treasurer upload files in OA system -> THU Finance Centre reimburse the funds to scholars' BOC account

FUNDING PARAMETERS

Program funds are intended to support the mission of the program. Funding can be spent on things that create educational opportunities, opportunities for professional development, and opportunities to participate in larger Tsinghua events and activities. These opportunities should open to the whole cohort rather than small group scholars.

Budget allocations CAN BE made for things such as:
a. Participating in Tsinghua competitions (sports, choir, chess, etc.): registration fees, field or court bookings, uniforms/costumes, etc.
b. Usage of the Schwarzman logo on swags or outfit has to be prior approved by PR team.
c. Celebrations (holiday events such as Winter Talent Show, cultural dinners/evenings, staff appreciation day, Tsinghua signature events like "Girls Day" and "Boys Day", Steve's Brief, etc.). This can include food purchased through Aramark or Chinese Apps, approved decorations, etc.
   * Please note:
     1. In terms of food purchase, only fapiao for catering services in Chinese "餐饮服务" can be reimbursed.
     2. The meal limit is 50 RMB per person.
d. Approved student-run events (in the past have included Women's Conference, China Week, Indian Culture Day, etc.). These also must go through the event approval process with the Events Director (Doug) prior to spending.
e. Equipment (tennis balls and racquets, kickboxing gloves, tents, sleeping bags, etc.). It is not recommended to purchase University's fixed assets. Students are not eligible for this application. Equipment pricing over 1,000 RMB per item needs to go through University's fixed assets process.
f. Busses for approved outings (cultural excursions, participation in sporting events, etc.)
g. Lecturers/instructors are welcomed to enrich events. You should be aware that there are a series of approvals for ones holding foreign passports, and only a few visa types are allowed to receive payment for giving lectures/instructions. Double check with the Events Director (Doug) and Students Programs Supervisor (Yuke) before sending out any invitation or spending any honorarium.

The following purchases CAN NOT be funded/reimbursed:
a. Purchase with no prior approved proposal record in OA.
b. Large purchase over 10,000 RMB with no contract approved by the College.
c. Gifts for people.
d. Swag or outfit presenting any type of the Schwarzman logo without prior approval from PR team.
e. Entry tickets to 'entertainment' (places, shows, movies, concerts, online gaming, etc.)
f. Drinks, including alcohol, bubble tea, coffee, juice, or any other drinks except water.
g. ANY expenses for parties/travel that are not directly related to program/academic objectives. This includes venue bookings for parties, busses/taxis, alcohol, decorations, etc.
h. Apps, online classes and events, etc.
i. Pre-paid cards/coupons or pre-deposit membership.
j. Donations to charities/groups.

The following have certain restrictions - make sure the proposal has been approved in OA system before booking or purchasing:
- Meals/food
- Small amount of snacks (that cannot be considered catering services / 餐饮服务)
- 'Infrastructure' for the college that will require space/storage/maintenance/upkeep costs - these must be approved by Operations/Executive Team (depending on the type of proposal)

Conditions for any travel expenses:
- Train tickets must be second class
- Flights must be economy class
- Busses/Didi can be booked, but only for program-sanctioned events (not for parties with alcohol, etc., due to legal liability of the program)

SCSA BUDGETING PROCESS
1. Refer to the Constitution/Bylaws.
2. Treasurer is responsible for maintaining budget records and liaising with the designated Student Life staff for reimbursements.

Recommended discussion/considerations:
- Funded vs. subsidized
- Allocations (e.g., sports, holiday events, conferences, etc.) vs. rolling funding
- Funding for individuals vs. larger groups
- Regular sharing of budget report with whole cohort

QUESTIONS?
Check with Yuke, Jing, Doug or Chad!`
  }
];

// Search knowledge base entries by query relevance
function searchKnowledgeBase(query) {
  const queryLower = query.toLowerCase().replace(/[^\w\s]/g, ' ');
  const terms = queryLower.split(/\s+/).filter(w => w.length > 1);

  if (terms.length === 0) return [];

  return KNOWLEDGE_BASE.filter(entry => {
    // A trigger term MUST appear in the query for this entry to activate
    const hasTrigger = entry.triggers.some(trigger => queryLower.includes(trigger));
    if (!hasTrigger) return false;
    return true;
  });
}

if (typeof window !== 'undefined') {
  window.KNOWLEDGE_BASE = KNOWLEDGE_BASE;
  window.searchKnowledgeBase = searchKnowledgeBase;
}
