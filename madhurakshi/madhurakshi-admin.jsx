import { useState, useRef, useEffect } from "react";

const SYSTEM_PROMPT = `You are the AI business advisor for Madhurakshi — an Indian ethnic wear e-commerce brand (sarees, kurtas, lehengas, ethnic sets). You have deep knowledge of their backend architecture and business.

TECH STACK KNOWLEDGE:
- Node.js + Express backend
- Supabase (PostgreSQL DB + Auth + Storage)
- Razorpay payments (UPI, cards, netbanking)
- COD (Cash on Delivery) support
- JWT-based auth via Supabase
- Rate limiting: 200 req/15min global, 20 req/15min for payments
- Atomic stock decrement via PostgreSQL RPC
- Webhook fallback for payment confirmation
- Routes: /api/products, /api/cart, /api/orders, /api/wishlist, /api/account
- Admin role via profiles table
- Review system with purchase verification

BUSINESS KNOWLEDGE:
- Sells ethnic Indian wear: sarees, kurtas, lehengas, dupatta sets, fabric options
- Target customers: Indian women 18-45, gifting market, diaspora
- Key metrics: conversion rate, cart abandonment, AOV (Average Order Value), repeat purchase rate
- Competitors: Fabindia, Manyavar, Jaypore, Nykaa Fashion
- Peak seasons: Diwali, Navratri, Eid, weddings, Karva Chauth

WEEKLY REVIEW CAPABILITY:
When asked for a weekly review, analyze across: Sales performance, Traffic & conversion, Stock alerts, Customer behavior, Marketing opportunities, Technical health. Be specific and actionable.

MARKETING & SALES:
- Instagram/Pinterest are primary channels for ethnic wear
- WhatsApp marketing works well for Indian market
- Festive season campaign planning
- Influencer strategy for ethnic wear
- Email re-engagement for cart abandons

Answer questions about the website, tech stack, business performance, marketing, or provide weekly business reviews. Be direct, specific, and actionable like a senior business advisor. When you notice issues in the code architecture shared with you, call them out honestly.`;

const MOCK_METRICS = {
  revenue: { week: 284500, month: 1124000, growth: 18.4 },
  orders: { week: 142, month: 589, growth: 12.1 },
  aov: { value: 2003, growth: 5.7 },
  conversion: { rate: 2.8, growth: -0.3 },
  cartAbandonment: 68,
  topProducts: [
    { name: "Kanjivaram Silk Saree", sales: 34, revenue: 85000, stock: 12 },
    { name: "Banarasi Lehenga Set", sales: 28, revenue: 70000, stock: 8 },
    { name: "Cotton Kurti (Block Print)", sales: 67, revenue: 33500, stock: 45 },
    { name: "Chikankari Dupatta", sales: 89, revenue: 26700, stock: 3 },
    { name: "Silk Blend Kurta Set", sales: 41, revenue: 57400, stock: 0 },
  ],
  weeklyRevenue: [38000, 42000, 35000, 51000, 47000, 39000, 32500],
  stockAlerts: [
    { name: "Chikankari Dupatta", stock: 3, sku: "DUP-CHK-001" },
    { name: "Banarasi Lehenga Set", stock: 8, sku: "LEH-BAN-M" },
    { name: "Silk Blend Kurta Set", stock: 0, sku: "KUR-SLK-L" },
  ],
  issues: [
    { type: "critical", text: "3 products with stock < 5 units" },
    { type: "warning", text: "Cart abandonment at 68% — industry avg is 70%, room to improve" },
    { type: "warning", text: "No email/order confirmation flow implemented yet" },
    { type: "info", text: "COD orders: 41% of total — monitor fraud risk" },
  ]
};

const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function MetricCard({ label, value, sub, color = "#1D9E75", icon }) {
  return (
    <div style={{
      background: "var(--color-background-primary)",
      border: "0.5px solid var(--color-border-tertiary)",
      borderRadius: "var(--border-radius-lg)",
      padding: "1rem 1.25rem",
      display: "flex",
      flexDirection: "column",
      gap: 4
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{label}</span>
        <span style={{ fontSize: 18, color }}>{icon}</span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 500, color: "var(--color-text-primary)" }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: sub.startsWith("-") ? "#E24B4A" : "#1D9E75" }}>{sub}</div>}
    </div>
  );
}

function MiniBar({ data, labels }) {
  const max = Math.max(...data);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 80, padding: "0 4px" }}>
      {data.map((v, i) => (
        <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          <div style={{
            width: "100%", background: "#1D9E75",
            height: `${Math.round((v / max) * 64)}px`,
            borderRadius: "3px 3px 0 0",
            opacity: i === 3 ? 1 : 0.6
          }} />
          <span style={{ fontSize: 10, color: "var(--color-text-secondary)" }}>{labels[i]}</span>
        </div>
      ))}
    </div>
  );
}

function StockBadge({ stock }) {
  if (stock === 0) return <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 12, background: "#FCEBEB", color: "#A32D2D" }}>Out of stock</span>;
  if (stock < 10) return <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 12, background: "#FAEEDA", color: "#854F0B" }}>{stock} left</span>;
  return <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 12, background: "#EAF3DE", color: "#3B6D11" }}>{stock} in stock</span>;
}

function ReviewBadge({ type }) {
  const styles = {
    critical: { bg: "#FCEBEB", color: "#A32D2D", icon: "⚠" },
    warning: { bg: "#FAEEDA", color: "#854F0B", icon: "!" },
    info: { bg: "#E6F1FB", color: "#185FA5", icon: "i" },
  };
  const s = styles[type];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      width: 18, height: 18, borderRadius: "50%",
      background: s.bg, color: s.color, fontSize: 10, fontWeight: 500, flexShrink: 0
    }}>{s.icon}</span>
  );
}

export default function App() {
  const [tab, setTab] = useState("dashboard");
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content: `Namaste! I'm your Madhurakshi AI business advisor.\n\nI know your full backend — Express, Supabase, Razorpay, your product catalog, order flow, and security architecture.\n\nAsk me anything:\n• "Give me a weekly business review"\n• "What's wrong with the backend code?"\n• "How do I grow sales this Diwali?"\n• "What marketing should I do this week?"\n• "Why is cart abandonment high?"`
    }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeIssue, setActiveIssue] = useState(null);
  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    const newMessages = [...messages, { role: "user", content: text }];
    setMessages(newMessages);
    setLoading(true);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: SYSTEM_PROMPT,
          messages: newMessages.map(m => ({ role: m.role, content: m.content }))
        })
      });
      const data = await res.json();
      const reply = data.content?.find(b => b.type === "text")?.text || "Sorry, I couldn't process that.";
      setMessages(prev => [...prev, { role: "assistant", content: reply }]);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Connection error. Please try again." }]);
    }
    setLoading(false);
  }

  function quickAsk(q) {
    setTab("chat");
    setTimeout(() => {
      setInput(q);
    }, 100);
  }

  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: "ti-layout-dashboard" },
    { id: "products", label: "Products", icon: "ti-shirt" },
    { id: "orders", label: "Orders", icon: "ti-shopping-bag" },
    { id: "review", label: "Weekly Review", icon: "ti-chart-line" },
    { id: "chat", label: "AI Advisor", icon: "ti-message-circle-2" },
  ];

  return (
    <div style={{ display: "flex", minHeight: 600, fontFamily: "var(--font-sans)", fontSize: 14 }}>
      <aside style={{
        width: 200, borderRight: "0.5px solid var(--color-border-tertiary)",
        background: "var(--color-background-secondary)",
        display: "flex", flexDirection: "column", padding: "1rem 0",
        flexShrink: 0
      }}>
        <div style={{ padding: "0 1rem 1.25rem", borderBottom: "0.5px solid var(--color-border-tertiary)", marginBottom: "0.75rem" }}>
          <div style={{ fontSize: 15, fontWeight: 500, color: "var(--color-text-primary)" }}>Madhurakshi</div>
          <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>Admin Panel</div>
        </div>
        {navItems.map(n => (
          <button key={n.id} onClick={() => setTab(n.id)} style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "0.5rem 1rem", margin: "1px 0.5rem",
            background: tab === n.id ? "var(--color-background-primary)" : "transparent",
            border: tab === n.id ? "0.5px solid var(--color-border-tertiary)" : "none",
            borderRadius: "var(--border-radius-md)",
            color: tab === n.id ? "var(--color-text-primary)" : "var(--color-text-secondary)",
            cursor: "pointer", fontSize: 13, textAlign: "left", fontWeight: tab === n.id ? 500 : 400
          }}>
            <i className={`ti ${n.icon}`} style={{ fontSize: 16 }} aria-hidden />
            {n.label}
            {n.id === "chat" && <span style={{ marginLeft: "auto", fontSize: 10, background: "#1D9E75", color: "#fff", borderRadius: 10, padding: "1px 6px" }}>AI</span>}
          </button>
        ))}
        <div style={{ marginTop: "auto", padding: "0.75rem 1rem", borderTop: "0.5px solid var(--color-border-tertiary)" }}>
          <div style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>Week of May 11, 2026</div>
        </div>
      </aside>

      <main style={{ flex: 1, overflow: "auto", padding: "1.25rem", background: "var(--color-background-tertiary)" }}>

        {tab === "dashboard" && (
          <div>
            <h2 style={{ margin: "0 0 1rem", fontSize: 18, fontWeight: 500 }}>Dashboard</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: "1.25rem" }}>
              <MetricCard label="Weekly Revenue" value={`₹${(MOCK_METRICS.revenue.week / 1000).toFixed(0)}K`} sub={`+${MOCK_METRICS.revenue.growth}% vs last week`} icon="₹" />
              <MetricCard label="Orders This Week" value={MOCK_METRICS.orders.week} sub={`+${MOCK_METRICS.orders.growth}% vs last week`} icon="📦" />
              <MetricCard label="Avg Order Value" value={`₹${MOCK_METRICS.aov.value}`} sub={`+${MOCK_METRICS.aov.growth}%`} icon="🛍" />
              <MetricCard label="Conversion Rate" value={`${MOCK_METRICS.conversion.rate}%`} sub={`${MOCK_METRICS.conversion.growth}% vs last week`} color="#E24B4A" icon="%" />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: "1.25rem" }}>
              <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: "1rem 1.25rem" }}>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: "0.75rem" }}>Revenue this week</div>
                <MiniBar data={MOCK_METRICS.weeklyRevenue} labels={days} />
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: "0.75rem" }}>
                  <span style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>Thu had highest sales (₹51K)</span>
                  <button onClick={() => quickAsk("Why might Thursday have the highest sales? And how do I replicate it?")} style={{ fontSize: 11, color: "#1D9E75", background: "none", border: "none", cursor: "pointer" }}>Ask AI ↗</button>
                </div>
              </div>

              <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: "1rem 1.25rem" }}>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: "0.75rem" }}>Issues to fix</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {MOCK_METRICS.issues.map((issue, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12 }}>
                      <ReviewBadge type={issue.type} />
                      <span style={{ color: "var(--color-text-primary)", lineHeight: 1.5 }}>{issue.text}</span>
                    </div>
                  ))}
                </div>
                <button onClick={() => quickAsk("Give me an action plan to fix all the current issues in my Madhurakshi store")} style={{ marginTop: "0.75rem", fontSize: 11, color: "#1D9E75", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Get AI action plan ↗</button>
              </div>
            </div>

            <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: "1rem 1.25rem", marginBottom: "1.25rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>Top products this week</div>
                <button onClick={() => setTab("products")} style={{ fontSize: 11, color: "#185FA5", background: "none", border: "none", cursor: "pointer" }}>See all</button>
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
                    {["Product", "Units sold", "Revenue", "Stock"].map(h => (
                      <th key={h} style={{ padding: "6px 8px", textAlign: "left", color: "var(--color-text-secondary)", fontWeight: 400 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {MOCK_METRICS.topProducts.map((p, i) => (
                    <tr key={i} style={{ borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
                      <td style={{ padding: "8px 8px", fontWeight: 500 }}>{p.name}</td>
                      <td style={{ padding: "8px 8px", color: "var(--color-text-secondary)" }}>{p.sales}</td>
                      <td style={{ padding: "8px 8px" }}>₹{p.revenue.toLocaleString("en-IN")}</td>
                      <td style={{ padding: "8px 8px" }}><StockBadge stock={p.stock} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ background: "#FAEEDA", border: "0.5px solid #FAC775", borderRadius: "var(--border-radius-lg)", padding: "0.875rem 1.25rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: "#633806" }}>Cart abandonment is at 68%</div>
                <div style={{ fontSize: 12, color: "#854F0B", marginTop: 2 }}>You're losing ~₹610K/month in potential revenue from abandoned carts</div>
              </div>
              <button onClick={() => quickAsk("My cart abandonment rate is 68%. What are the top 5 things I should do to recover those sales for Madhurakshi?")} style={{ fontSize: 12, padding: "6px 12px", background: "#854F0B", color: "#fff", border: "none", borderRadius: "var(--border-radius-md)", cursor: "pointer", whiteSpace: "nowrap" }}>Fix this ↗</button>
            </div>
          </div>
        )}

        {tab === "products" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 500 }}>Products</h2>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => quickAsk("Which product categories should I expand in my Madhurakshi store to grow revenue?")} style={{ fontSize: 12, color: "#185FA5", background: "none", border: "0.5px solid var(--color-border-secondary)", borderRadius: "var(--border-radius-md)", padding: "5px 12px", cursor: "pointer" }}>AI suggestions ↗</button>
                <button style={{ fontSize: 12, background: "#1D9E75", color: "#fff", border: "none", borderRadius: "var(--border-radius-md)", padding: "5px 12px", cursor: "pointer" }}>+ Add product</button>
              </div>
            </div>

            <div style={{ background: "#FCEBEB", border: "0.5px solid #F7C1C1", borderRadius: "var(--border-radius-md)", padding: "0.75rem 1rem", marginBottom: "1rem", display: "flex", gap: 8, alignItems: "flex-start" }}>
              <span style={{ color: "#A32D2D", fontSize: 16 }}>⚠</span>
              <div>
                <div style={{ fontSize: 12, fontWeight: 500, color: "#A32D2D" }}>Stock alerts</div>
                {MOCK_METRICS.stockAlerts.map((s, i) => (
                  <div key={i} style={{ fontSize: 12, color: "#791F1F", marginTop: 2 }}>
                    {s.stock === 0 ? "OUT OF STOCK" : `Only ${s.stock} left`} — {s.name} ({s.sku})
                  </div>
                ))}
              </div>
            </div>

            <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "var(--color-background-secondary)", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
                    {["Product", "Category", "Price", "Stock", "Sales", "Status", "Actions"].map(h => (
                      <th key={h} style={{ padding: "8px 12px", textAlign: "left", color: "var(--color-text-secondary)", fontWeight: 400 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    { name: "Kanjivaram Silk Saree", cat: "Sarees", price: 2500, stock: 12, sales: 34, status: "active" },
                    { name: "Banarasi Lehenga Set", cat: "Lehengas", price: 2500, stock: 8, sales: 28, status: "active" },
                    { name: "Cotton Kurti (Block Print)", cat: "Kurtis", price: 500, stock: 45, sales: 67, status: "active" },
                    { name: "Chikankari Dupatta", cat: "Accessories", price: 300, stock: 3, sales: 89, status: "low-stock" },
                    { name: "Silk Blend Kurta Set", cat: "Kurta Sets", price: 1400, stock: 0, sales: 41, status: "out-of-stock" },
                    { name: "Bandhani Saree", cat: "Sarees", price: 1800, stock: 22, sales: 15, status: "active" },
                    { name: "Phulkari Dupatta", cat: "Accessories", price: 450, stock: 18, sales: 31, status: "active" },
                  ].map((p, i) => (
                    <tr key={i} style={{ borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
                      <td style={{ padding: "10px 12px", fontWeight: 500 }}>{p.name}</td>
                      <td style={{ padding: "10px 12px", color: "var(--color-text-secondary)" }}>{p.cat}</td>
                      <td style={{ padding: "10px 12px" }}>₹{p.price.toLocaleString("en-IN")}</td>
                      <td style={{ padding: "10px 12px" }}><StockBadge stock={p.stock} /></td>
                      <td style={{ padding: "10px 12px", color: "var(--color-text-secondary)" }}>{p.sales}</td>
                      <td style={{ padding: "10px 12px" }}>
                        <span style={{
                          fontSize: 11, padding: "2px 8px", borderRadius: 12,
                          background: p.status === "active" ? "#EAF3DE" : p.status === "low-stock" ? "#FAEEDA" : "#FCEBEB",
                          color: p.status === "active" ? "#3B6D11" : p.status === "low-stock" ? "#854F0B" : "#A32D2D"
                        }}>
                          {p.status === "out-of-stock" ? "Out of stock" : p.status === "low-stock" ? "Low stock" : "Active"}
                        </span>
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <button style={{ fontSize: 11, padding: "3px 8px", background: "none", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-md)", cursor: "pointer", color: "var(--color-text-secondary)" }}>Edit</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "orders" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 500 }}>Orders</h2>
              <button onClick={() => quickAsk("41% of my orders are COD. What fraud risk does this create and how do I handle it safely?")} style={{ fontSize: 12, color: "#185FA5", background: "none", border: "0.5px solid var(--color-border-secondary)", borderRadius: "var(--border-radius-md)", padding: "5px 12px", cursor: "pointer" }}>COD fraud analysis ↗</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: "1rem" }}>
              {[
                { label: "Pending", count: 18, color: "#854F0B", bg: "#FAEEDA" },
                { label: "Confirmed", count: 94, color: "#185FA5", bg: "#E6F1FB" },
                { label: "Delivered", count: 211, color: "#3B6D11", bg: "#EAF3DE" },
                { label: "Cancelled", count: 7, color: "#A32D2D", bg: "#FCEBEB" },
              ].map(s => (
                <div key={s.label} style={{ background: s.bg, border: `0.5px solid ${s.bg}`, borderRadius: "var(--border-radius-md)", padding: "0.75rem 1rem" }}>
                  <div style={{ fontSize: 11, color: s.color }}>{s.label}</div>
                  <div style={{ fontSize: 22, fontWeight: 500, color: s.color }}>{s.count}</div>
                </div>
              ))}
            </div>
            <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "var(--color-background-secondary)", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
                    {["Order #", "Customer", "Items", "Amount", "Method", "Status", "Date"].map(h => (
                      <th key={h} style={{ padding: "8px 12px", textAlign: "left", color: "var(--color-text-secondary)", fontWeight: 400 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    { no: "MDH-2841", cust: "Priya Sharma", items: 2, amt: 4300, method: "Razorpay", status: "confirmed", date: "Today" },
                    { no: "MDH-2840", cust: "Anita Patel", items: 1, amt: 2500, method: "COD", status: "pending", date: "Today" },
                    { no: "MDH-2839", cust: "Sunita Rao", items: 3, amt: 1200, method: "Razorpay", status: "delivered", date: "Yesterday" },
                    { no: "MDH-2838", cust: "Kavita Nair", items: 1, amt: 2500, method: "COD", status: "cancelled", date: "Yesterday" },
                    { no: "MDH-2837", cust: "Rekha Gupta", items: 2, amt: 3700, method: "Razorpay", status: "confirmed", date: "May 10" },
                    { no: "MDH-2836", cust: "Meena Joshi", items: 1, amt: 1800, method: "COD", status: "delivered", date: "May 10" },
                  ].map((o, i) => (
                    <tr key={i} style={{ borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
                      <td style={{ padding: "10px 12px", fontWeight: 500, color: "#185FA5" }}>{o.no}</td>
                      <td style={{ padding: "10px 12px" }}>{o.cust}</td>
                      <td style={{ padding: "10px 12px", color: "var(--color-text-secondary)" }}>{o.items}</td>
                      <td style={{ padding: "10px 12px" }}>₹{o.amt.toLocaleString("en-IN")}</td>
                      <td style={{ padding: "10px 12px" }}>
                        <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 12, background: o.method === "COD" ? "#FAEEDA" : "#EAF3DE", color: o.method === "COD" ? "#854F0B" : "#3B6D11" }}>{o.method}</span>
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <span style={{
                          fontSize: 11, padding: "2px 8px", borderRadius: 12,
                          background: { confirmed: "#E6F1FB", pending: "#FAEEDA", delivered: "#EAF3DE", cancelled: "#FCEBEB" }[o.status],
                          color: { confirmed: "#185FA5", pending: "#854F0B", delivered: "#3B6D11", cancelled: "#A32D2D" }[o.status]
                        }}>{o.status}</span>
                      </td>
                      <td style={{ padding: "10px 12px", color: "var(--color-text-secondary)" }}>{o.date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "review" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 500 }}>Weekly Review</h2>
                <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 2 }}>Week of May 5–11, 2026</div>
              </div>
              <button onClick={() => quickAsk("Give me a full weekly business review for Madhurakshi for this week. Include: what went well, what's lagging, sales analysis, marketing recommendations, and the top 3 actions I should take right now.")} style={{ fontSize: 13, padding: "7px 16px", background: "#1D9E75", color: "#fff", border: "none", borderRadius: "var(--border-radius-md)", cursor: "pointer" }}>Generate AI Review ↗</button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: "1.25rem" }}>
              {[
                {
                  title: "What's going well", icon: "✓", color: "#3B6D11", bg: "#EAF3DE", border: "#C0DD97",
                  items: ["Revenue up 18.4% week-on-week", "Cotton kurti has 67 units sold — strongest performer", "COD flow working smoothly", "Stock decrement is atomic — no oversell bugs", "Payment webhook handles tab-close edge case correctly"]
                },
                {
                  title: "What's lagging", icon: "↓", color: "#A32D2D", bg: "#FCEBEB", border: "#F7C1C1",
                  items: ["No email confirmation on order placed — customers in dark", "Silk Blend Kurta Set is out of stock — losing sales", "Conversion rate dipped 0.3% — needs investigation", "No admin analytics dashboard yet (you're reading mock data)", "No WhatsApp/SMS notifications for Indian customers"]
                }
              ].map((card, i) => (
                <div key={i} style={{ background: card.bg, border: `0.5px solid ${card.border}`, borderRadius: "var(--border-radius-lg)", padding: "1rem 1.25rem" }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: card.color, marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: 6 }}>
                    <span>{card.icon}</span> {card.title}
                  </div>
                  <ul style={{ margin: 0, padding: "0 0 0 1rem", display: "flex", flexDirection: "column", gap: 6 }}>
                    {card.items.map((item, j) => <li key={j} style={{ fontSize: 12, color: card.color, lineHeight: 1.5 }}>{item}</li>)}
                  </ul>
                </div>
              ))}
            </div>

            <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: "1rem 1.25rem", marginBottom: "1.25rem" }}>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: "0.75rem" }}>Top 3 actions this week</div>
              {[
                { n: 1, action: "Restock Silk Blend Kurta Set immediately", impact: "Est. +₹30K revenue", tag: "urgent" },
                { n: 2, action: "Add Resend email for order confirmation", impact: "Reduces support load by ~40%", tag: "this week" },
                { n: 3, action: "Launch Diwali pre-collection teaser on Instagram", impact: "Start building hype now (5 months out)", tag: "marketing" },
              ].map((a, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: i < 2 ? "0.5px solid var(--color-border-tertiary)" : "none" }}>
                  <span style={{ width: 24, height: 24, borderRadius: "50%", background: "#1D9E75", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 500, flexShrink: 0 }}>{a.n}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{a.action}</div>
                    <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 2 }}>{a.impact}</div>
                  </div>
                  <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 12, background: a.tag === "urgent" ? "#FCEBEB" : a.tag === "marketing" ? "#E6F1FB" : "#FAEEDA", color: a.tag === "urgent" ? "#A32D2D" : a.tag === "marketing" ? "#185FA5" : "#854F0B" }}>{a.tag}</span>
                  <button onClick={() => quickAsk(`How do I "${a.action}" for Madhurakshi? Give me step-by-step instructions.`)} style={{ fontSize: 11, color: "#1D9E75", background: "none", border: "none", cursor: "pointer", whiteSpace: "nowrap" }}>How? ↗</button>
                </div>
              ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              {[
                { label: "Marketing focus", items: ["Navratri campaign prep (Oct)", "Instagram Reels for new arrivals", "Retarget cart abandoners via Meta ads", "Collaborate with ethnic wear influencers"], color: "#185FA5", bg: "#E6F1FB", border: "#B5D4F4" },
                { label: "Tech to build next", items: ["Order confirmation emails (Resend)", "Admin analytics with real Supabase data", "WhatsApp order alerts", "Search + filter improvements"], color: "#533AB7", bg: "#EEEDFE", border: "#CECBF6" },
                { label: "Watch closely", items: ["COD return rate (track manually)", "Conversion rate — investigate drop", "Stock of Banarasi Lehenga (8 left)", "Page load speed — impacts mobile conversion"], color: "#633806", bg: "#FAEEDA", border: "#FAC775" },
              ].map((c, i) => (
                <div key={i} style={{ background: c.bg, border: `0.5px solid ${c.border}`, borderRadius: "var(--border-radius-lg)", padding: "1rem" }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: c.color, marginBottom: "0.75rem" }}>{c.label}</div>
                  {c.items.map((item, j) => (
                    <div key={j} style={{ fontSize: 11, color: c.color, marginBottom: 6, display: "flex", gap: 6 }}>
                      <span>→</span><span>{item}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "chat" && (
          <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 3rem)", maxHeight: 700 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 500 }}>AI Business Advisor</h2>
                <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>Knows your backend, products, and market</div>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {["Weekly review", "Fix cart abandonment", "Diwali strategy", "Code issues?"].map(q => (
                  <button key={q} onClick={() => setInput(q === "Weekly review" ? "Give me a full weekly business review for Madhurakshi" : q === "Code issues?" ? "What are the main issues or risks in my backend code?" : q === "Diwali strategy" ? "Create a Diwali marketing strategy for Madhurakshi" : `My cart abandonment is 68%. How do I reduce it?`)} style={{ fontSize: 11, padding: "4px 10px", background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-secondary)", borderRadius: "var(--border-radius-md)", cursor: "pointer", color: "var(--color-text-secondary)" }}>{q}</button>
                ))}
              </div>
            </div>

            <div style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column", gap: 12, paddingBottom: "0.5rem" }}>
              {messages.map((msg, i) => (
                <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
                  <div style={{
                    maxWidth: "78%",
                    padding: "0.75rem 1rem",
                    borderRadius: msg.role === "user" ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
                    background: msg.role === "user" ? "#1D9E75" : "var(--color-background-primary)",
                    color: msg.role === "user" ? "#fff" : "var(--color-text-primary)",
                    border: msg.role === "user" ? "none" : "0.5px solid var(--color-border-tertiary)",
                    fontSize: 13, lineHeight: 1.65,
                    whiteSpace: "pre-wrap"
                  }}>
                    {msg.role === "assistant" && <div style={{ fontSize: 10, color: "#1D9E75", fontWeight: 500, marginBottom: 4 }}>AI ADVISOR</div>}
                    {msg.content}
                  </div>
                </div>
              ))}
              {loading && (
                <div style={{ display: "flex", justifyContent: "flex-start" }}>
                  <div style={{ padding: "0.75rem 1rem", borderRadius: "12px 12px 12px 2px", background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", fontSize: 13, color: "var(--color-text-secondary)" }}>
                    Thinking...
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            <div style={{ display: "flex", gap: 8, paddingTop: "0.75rem", borderTop: "0.5px solid var(--color-border-tertiary)" }}>
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendMessage()}
                placeholder="Ask about your business, code, marketing, or weekly performance..."
                style={{ flex: 1, padding: "10px 14px", borderRadius: "var(--border-radius-md)", border: "0.5px solid var(--color-border-secondary)", fontSize: 13, background: "var(--color-background-primary)", color: "var(--color-text-primary)", outline: "none" }}
              />
              <button onClick={sendMessage} disabled={loading || !input.trim()} style={{ padding: "10px 16px", background: input.trim() && !loading ? "#1D9E75" : "var(--color-background-secondary)", color: input.trim() && !loading ? "#fff" : "var(--color-text-tertiary)", border: "none", borderRadius: "var(--border-radius-md)", cursor: input.trim() && !loading ? "pointer" : "default", fontSize: 13, fontWeight: 500, transition: "all 0.15s" }}>
                Send
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
