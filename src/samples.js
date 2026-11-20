/**
 * Curated fake sample documents for testing and live demonstrations.
 * Pure fake data — zero real personal data.
 */

export const SAMPLES = {
  SAMPLE_1: {
    id: 'loan-email',
    title: '1. Loan Note (Short, Sensitive)',
    description: 'Short financial email under 1500 chars. Ideal for Route A (On-Device).',
    text: `Hi Priya, the loan of ₹4,50,000 for account 5021-8834-2210 must be repaid by 15 Jan.
Rahul Mehta at 98450 12345 will confirm. Email him at rahul.mehta@example.com.`
  },

  SAMPLE_2: {
    id: 'freelance-contract',
    title: '2. Freelance Contract (Long, Sensitive)',
    description: 'Independent contractor agreement with PII, bank account, PAN, and deadlines.',
    text: `INDEPENDENT CONTRACTOR SERVICES AGREEMENT

This Agreement is entered into on 1st November 2026 by and between:
Client: Apex Global Technologies Ltd., located at 44 Residency Road, Bengaluru 560025, represented by Director Vikram Malhotra (Email: vikram.m@apextechnologies.com, Phone: +91 98451 22334),
AND
Contractor: Rohan Sharma, residing at Flat 302, Palm Grove Apts, Indiranagar, Bengaluru 560038 (Email: rohan.sharma.dev@example.org, Phone: +91 99887 76655, PAN: ABCDE1234F).

1. Scope of Work & Deliverables
The Contractor shall deliver the full cloud migration architecture by 15th December 2026. Weekly milestones shall be reviewed by Project Lead Anita Desai (anita.desai@apextechnologies.com).

2. Compensation & Payment Terms
Client agrees to pay Contractor a total sum of ₹3,75,000 (Three Lakh Seventy-Five Thousand Indian Rupees) payable in three installments:
- Milestone 1: ₹1,25,000 upon signing.
- Milestone 2: ₹1,25,000 upon architecture sign-off (due 30th November 2026).
- Milestone 3: ₹1,25,000 upon production verification.

Payments shall be made via NEFT/RTGS to Contractor's designated bank account:
Bank Account: 4091-2283-9912
Bank Name: HDFC Bank Ltd.
IFSC Code: HDFC0001234
Aadhaar Number: 4821 9912 3014

3. Delay Penalties
In the event that Contractor fails to meet the final deadline of 15th December 2026 without mutual written consent, a penalty of ₹5,000 per business day of delay will be deducted from the final milestone payment, up to a maximum cap of ₹50,000.

4. Termination Clause
Either party may terminate this Agreement with fourteen (14) days written notice. In case of breach of confidentiality, Apex Global Technologies Ltd. reserves the right to terminate immediately with immediate cessation of all payments.

5. Confidentiality & Non-Disclosure
Contractor agrees not to disclose proprietary code, architecture designs, or internal client communications to any third party.`
  },

  SAMPLE_3: {
    id: 'public-article',
    title: '3. Tech Article (Long, Non-Sensitive)',
    description: 'Long neutral public article with no names, contacts, or financial details.',
    text: `The Evolution of Edge Computing in Distributed Systems

Over the past decade, distributed systems have progressively transitioned from monolithic centralized data centers to highly distributed edge computing architectures. In edge computing, computation is performed close to the source of data generation rather than relying entirely on remote cloud clusters. This paradigm shift offers significant improvements in bandwidth optimization, round-trip latency, and system resilience.

Modern web applications increasingly leverage localized processing to deliver near-instant user experiences. Rather than sending raw sensor data, telemetry, or user interactions across global backbones, client devices and edge nodes perform initial filtering, aggregation, and inference locally. Only synthesized insights or structured summaries are subsequently forwarded upstream to centralized systems.

This distributed architecture fundamentally alters how fault tolerance and state synchronization are engineered. Systems must gracefully accommodate intermittent connectivity, asynchronous state updates, and resource constraints inherent to edge devices. As machine learning hardware accelerators become standard on mobile chipsets, laptops, and browser runtimes, on-device artificial intelligence represents the next natural milestone in the evolution of edge infrastructure.`
  },

  SAMPLE_4: {
    id: 'tricky-edge-cases',
    title: '4. Tricky Edge Cases',
    description: 'Tests Luhn validation, false-positive account numbers, and addresses.',
    text: `Call me on +91 98450 12345 or (080) 4455 6677. Card: 4111 1111 1111 1111.
Fake card failing Luhn: 4111 1111 1111 1112.
PAN ABCDE1234F. Order number 123456 is not an account. Dr. Anita Rao of Rao & Sons, 12 MG Road, Bengaluru 560001.`
  }
};
