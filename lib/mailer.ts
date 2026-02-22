import nodemailer from "nodemailer";

// ---------------------------------------------------------------------------
//  Gmail SMTP transport (singleton)
// ---------------------------------------------------------------------------

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const FROM = `"Symbi-OS" <${process.env.SMTP_USER}>`;

// ---------------------------------------------------------------------------
//  Fire-and-forget sender — never blocks API responses
// ---------------------------------------------------------------------------

function sendMail(to: string, subject: string, html: string) {
  transporter.sendMail({ from: FROM, to, subject, html }).catch((err) => {
    console.error("[mailer] Failed to send email:", err.message);
  });
}

// ---------------------------------------------------------------------------
//  Email templates
// ---------------------------------------------------------------------------

/** Notify seller that a buyer placed a bid on their material */
export function notifySellerOfNewBid(opts: {
  sellerEmail: string;
  materialName: string;
  bidderCompany: string;
  quantity: number;
  pricePerUnit: number;
}) {
  const { sellerEmail, materialName, bidderCompany, quantity, pricePerUnit } = opts;
  sendMail(
    sellerEmail,
    `New bid on "${materialName}" — Symbi-OS`,
    `<div style="font-family:sans-serif;max-width:500px">
      <h2 style="color:#10b981">New Bid Received</h2>
      <p><strong>${bidderCompany}</strong> placed a bid on your listing:</p>
      <table style="border-collapse:collapse;width:100%">
        <tr><td style="padding:4px 8px;color:#888">Material</td><td style="padding:4px 8px">${materialName}</td></tr>
        <tr><td style="padding:4px 8px;color:#888">Quantity</td><td style="padding:4px 8px">${quantity} units</td></tr>
        <tr><td style="padding:4px 8px;color:#888">Price/Unit</td><td style="padding:4px 8px">$${pricePerUnit.toFixed(2)}</td></tr>
      </table>
      <p style="margin-top:16px">Log in to <strong>Symbi-OS</strong> to accept or reject this bid.</p>
    </div>`
  );
}

/** Notify buyer that seller accepted/rejected their bid */
export function notifyBuyerOfBidDecision(opts: {
  buyerEmail: string;
  materialName: string;
  sellerCompany: string;
  status: "accepted" | "rejected";
}) {
  const { buyerEmail, materialName, sellerCompany, status } = opts;
  const color = status === "accepted" ? "#10b981" : "#ef4444";
  const emoji = status === "accepted" ? "Accepted" : "Rejected";
  sendMail(
    buyerEmail,
    `Bid ${emoji}: "${materialName}" — Symbi-OS`,
    `<div style="font-family:sans-serif;max-width:500px">
      <h2 style="color:${color}">Bid ${emoji}</h2>
      <p><strong>${sellerCompany}</strong> has <strong style="color:${color}">${status}</strong> your bid on <strong>${materialName}</strong>.</p>
      ${status === "accepted" ? "<p>Log in to <strong>Symbi-OS</strong> to proceed with the transaction.</p>" : "<p>You can place a new bid or explore other listings on Symbi-OS.</p>"}
    </div>`
  );
}

/** Notify a seeker (demand registrant) that new supply is available */
export function notifySeekerOfNewSupply(opts: {
  seekerEmail: string;
  materialName: string;
  sellerCompany: string;
}) {
  const { seekerEmail, materialName, sellerCompany } = opts;
  sendMail(
    seekerEmail,
    `"${materialName}" is now available — Symbi-OS`,
    `<div style="font-family:sans-serif;max-width:500px">
      <h2 style="color:#10b981">Material Now Available!</h2>
      <p>Great news — <strong>${sellerCompany}</strong> just listed <strong>${materialName}</strong>, which you were looking for.</p>
      <p>Log in to <strong>Symbi-OS</strong> to view the listing and place a bid.</p>
    </div>`
  );
}

/** Confirm demand registration to the buyer */
export function notifyDemandRegistered(opts: {
  buyerEmail: string;
  materialQuery: string;
}) {
  const { buyerEmail, materialQuery } = opts;
  sendMail(
    buyerEmail,
    `Demand registered — Symbi-OS`,
    `<div style="font-family:sans-serif;max-width:500px">
      <h2 style="color:#06b6d4">Demand Registered</h2>
      <p>We've registered your interest in: <strong>"${materialQuery}"</strong></p>
      <p>You'll receive an email when a seller lists matching materials on the network.</p>
    </div>`
  );
}
