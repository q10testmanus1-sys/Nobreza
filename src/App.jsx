import React, { useState, useEffect, useMemo } from "react";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, LineChart, Line, XAxis, YAxis,
} from "recharts";
import {
  Calendar, ArrowUpRight, ArrowDownRight, Wallet, Home, PlusCircle, List,
  Target, Palette, ChevronLeft, ChevronRight, Pencil, Trash2, X, Plus, PieChart as PieIcon,
  Loader2,
} from "lucide-react";
import storage from "./lib/storage";

/* ============ paleta ============ */
const C = {
  black: "#0A0612",
  gradTop: "#4A1D96",
  gradBottom: "#7C3AED",
  cardBg: "rgba(255,255,255,0.10)",
  cardBorder: "rgba(255,255,255,0.20)",
  ink: "#FFFFFF",
  muted: "#D1D5DB",
  pink: "#FF006E",
  cyan: "#00D4FF",
  yellow: "#FFBE0B",
  green: "#39FF14",
  navBg: "#150C2E",
};

const DEFAULT_CATS = [
  { id: "moradia", label: "Moradia", color: "#FF006E" },
  { id: "alimentacao", label: "Alimentação", color: "#00D4FF" },
  { id: "transporte", label: "Transporte", color: "#FFBE0B" },
  { id: "lazer", label: "Lazer", color: "#39FF14" },
  { id: "saude", label: "Saúde", color: "#FF7AB6" },
  { id: "educacao", label: "Educação", color: "#A78BFA" },
  { id: "cartao", label: "Cartão / Dívidas", color: "#F472B6" },
  { id: "outros", label: "Outros", color: "#94A3B8" },
];
const catColor = (cats, id) => cats.find((c) => c.id === id)?.color || "#94A3B8";
const catLabel = (cats, id) => cats.find((c) => c.id === id)?.label || "Outros";

const pad2 = (n) => String(n).padStart(2, "0");
const monthKey = (y, m) => `${y}-${pad2(m)}`;
const fmtBRL = (v) => (isFinite(v) ? v : 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const monthLabel = (y, m) => {
  const s = new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const monthShort = (y, m) => {
  const s = new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "short" });
  return s.charAt(0).toUpperCase() + s.slice(1).replace(".", "");
};
const addMonths = (y, m, delta) => {
  const idx = y * 12 + (m - 1) + delta;
  return { y: Math.floor(idx / 12), m: (idx % 12) + 1 };
};
const uid = () => Math.random().toString(36).slice(2, 10);

const STORAGE_KEY = "nobreza-financas-v1";
const emptyData = () => ({ incomes: {}, fixedDebts: [], installments: [], goals: [], categories: DEFAULT_CATS.map((c) => ({ ...c })) });
const normalizeIncomes = (incomes = {}) => {
  const out = {};
  Object.entries(incomes).forEach(([mk, val]) => {
    if (Array.isArray(val)) out[mk] = val;
    else if (typeof val === "number" && val > 0) out[mk] = [{ id: uid(), name: "Entrada", amount: val }];
    else out[mk] = [];
  });
  return out;
};

/* ============ helpers de cálculo por mês (reutilizados p/ resumo e evolução) ============ */
function computeMonth(data, y, m) {
  const mk = monthKey(y, m);
  const entradas = data.incomes[mk] || [];
  const income = entradas.reduce((s, e) => s + e.amount, 0);
  const fixedTotal = data.fixedDebts.reduce((s, f) => s + f.amount, 0);
  const curIdx = y * 12 + (m - 1);
  const active = data.installments
    .map((p) => {
      const [sy, sm] = p.start.split("-").map(Number);
      const startIdx = sy * 12 + (sm - 1);
      const n = curIdx - startIdx + 1;
      if (n < 1 || n > p.installments) return null;
      return { ...p, current: n, monthlyAmount: p.total / p.installments };
    })
    .filter(Boolean);
  const installmentTotal = active.reduce((s, p) => s + p.monthlyAmount, 0);
  const spent = fixedTotal + installmentTotal;
  return { entradas, income, fixedTotal, installmentTotal, spent, active, balance: income - spent };
}

export default function Nobreza() {
  const today = new Date();
  const [cursor, setCursor] = useState({ y: today.getFullYear(), m: today.getMonth() + 1 });
  const [data, setData] = useState(null);
  const [status, setStatus] = useState("loading");
  const [modal, setModal] = useState(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [view, setView] = useState("dashboard"); // dashboard | metas | perfil
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    (async () => {
      let loaded = null;
      try {
        const res = await storage.get(STORAGE_KEY, false);
        if (res) loaded = JSON.parse(res.value);
      } catch {}
      const base = loaded || emptyData();
      setData({
        ...base,
        incomes: normalizeIncomes(base.incomes),
        goals: base.goals || [],
        categories: base.categories && base.categories.length ? base.categories : DEFAULT_CATS.map((c) => ({ ...c })),
      });
      setStatus("ready");
    })();
  }, []);

  useEffect(() => {
    if (status !== "ready" || !data) return;
    const t = setTimeout(() => {
      storage.set(STORAGE_KEY, JSON.stringify(data), false).catch((e) => console.error(e));
    }, 400);
    return () => clearTimeout(t);
  }, [data, status]);

  const mk = monthKey(cursor.y, cursor.m);
  const { entradas, income, active: activeInstallments, spent, balance } = useMemo(
    () => (data ? computeMonth(data, cursor.y, cursor.m) : { entradas: [], income: 0, active: [], spent: 0, balance: 0 }),
    [data, cursor]
  );
  const pctSpent = income > 0 ? Math.min(spent / income, 1) : spent > 0 ? 1 : 0;

  const chartData = useMemo(() => {
    if (!data) return [];
    const byCat = {};
    data.fixedDebts.forEach((f) => (byCat[f.category] = (byCat[f.category] || 0) + f.amount));
    activeInstallments.forEach((p) => (byCat[p.category] = (byCat[p.category] || 0) + p.monthlyAmount));
    return Object.entries(byCat)
      .map(([id, value]) => ({ id, name: catLabel(data.categories, id), value, color: catColor(data.categories, id) }))
      .sort((a, b) => b.value - a.value);
  }, [data, activeInstallments]);

  const evolution = useMemo(() => {
    if (!data) return [];
    const out = [];
    for (let i = 5; i >= 0; i--) {
      const c = addMonths(cursor.y, cursor.m, -i);
      const { spent: s } = computeMonth(data, c.y, c.m);
      out.push({ label: monthShort(c.y, c.m), value: s });
    }
    return out;
  }, [data, cursor]);

  const saveEntrada = (item, editingId) => {
    setData((d) => {
      const list = d.incomes[mk] || [];
      const next = editingId ? list.map((e) => (e.id === editingId ? { ...e, ...item } : e)) : [...list, { id: uid(), ...item }];
      return { ...d, incomes: { ...d.incomes, [mk]: next } };
    });
    setModal(null);
  };
  const removeEntrada = (id) => setData((d) => ({ ...d, incomes: { ...d.incomes, [mk]: (d.incomes[mk] || []).filter((e) => e.id !== id) } }));

  const saveFixed = (item, editingId) => {
    setData((d) => ({
      ...d,
      fixedDebts: editingId ? d.fixedDebts.map((f) => (f.id === editingId ? { ...f, ...item } : f)) : [...d.fixedDebts, { id: uid(), ...item }],
    }));
    setModal(null);
  };
  const removeFixed = (id) => setData((d) => ({ ...d, fixedDebts: d.fixedDebts.filter((f) => f.id !== id) }));

  const saveInstallment = (item, editingId) => {
    setData((d) => ({
      ...d,
      installments: editingId ? d.installments.map((p) => (p.id === editingId ? { ...p, ...item } : p)) : [...d.installments, { id: uid(), paid: {}, ...item }],
    }));
    setModal(null);
  };
  const removeInstallment = (id) => setData((d) => ({ ...d, installments: d.installments.filter((p) => p.id !== id) }));
  const toggleParcel = (instId, idx) => {
    setData((d) => ({
      ...d,
      installments: d.installments.map((p) => (p.id === instId ? { ...p, paid: { ...p.paid, [idx]: !p.paid?.[idx] } } : p)),
    }));
  };

  const saveGoal = (item, editingId) => {
    setData((d) => ({
      ...d,
      goals: editingId ? d.goals.map((g) => (g.id === editingId ? { ...g, ...item } : g)) : [...d.goals, { id: uid(), ...item }],
    }));
    setModal(null);
  };
  const removeGoal = (id) => setData((d) => ({ ...d, goals: d.goals.filter((g) => g.id !== id) }));

  const editCategory = (id, changes) => {
    setData((d) => ({ ...d, categories: d.categories.map((c) => (c.id === id ? { ...c, ...changes } : c)) }));
  };

  const overview = useMemo(() => {
    if (!data) return { totalSaved: 0, monthsTracked: 0 };
    const monthKeys = Object.keys(data.incomes).filter((k) => (data.incomes[k] || []).length > 0);
    let totalSaved = 0;
    monthKeys.forEach((k) => {
      const [y, m] = k.split("-").map(Number);
      const { balance } = computeMonth(data, y, m);
      totalSaved += balance;
    });
    return { totalSaved, monthsTracked: monthKeys.length };
  }, [data]);

  const resetAllData = async () => {
    const fresh = emptyData();
    setData(fresh);
    setConfirmReset(false);
    try { await storage.set(STORAGE_KEY, JSON.stringify(fresh), false); } catch {}
  };

  if (status === "loading" || !data) {
    return (
      <div style={{ background: `linear-gradient(180deg, ${C.black} 0%, ${C.gradTop} 55%, ${C.gradBottom} 100%)` }} className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin" color="#FFFFFF" size={32} />
      </div>
    );
  }

  return (
    <div style={{ background: `linear-gradient(180deg, ${C.black} 0%, ${C.gradTop} 45%, ${C.gradBottom} 100%)`, minHeight: "100vh" }} className="font-sans">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&family=Fraunces:wght@500;600&display=swap');
        .font-sans { font-family: 'Poppins', sans-serif; }
        .font-display { font-family: 'Fraunces', serif; }
        .glass { background: ${C.cardBg}; backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px); border: 1px solid ${C.cardBorder}; border-radius: 24px; }
        input:focus, select:focus, button:focus { outline: 2px solid #FFFFFF55; outline-offset: 2px; }
        ::-webkit-scrollbar { width: 8px; }
        ::-webkit-scrollbar-thumb { background: #FFFFFF30; border-radius: 4px; }
        .row-hover:hover { background: #FFFFFF0D; }
        .heartbeat {
          animation: heartbeat 1.8s ease-in-out infinite;
          filter: drop-shadow(0 0 14px #FF006E60) drop-shadow(0 0 22px #7C3AED50);
        }
        @keyframes heartbeat {
          0%, 100%  { transform: scale(1); }
          14%       { transform: scale(1.14); }
          28%       { transform: scale(1); }
          42%       { transform: scale(1.1); }
          70%       { transform: scale(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          .heartbeat { animation: none; }
        }
      `}</style>

      <div className="max-w-md mx-auto px-4 pt-8 pb-28">
        {/* HEADER */}
        <header id="top" className="flex flex-col items-center mb-6">
          <img src="data:image/webp;base64,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" alt="Nobreza" className="heartbeat" style={{ height: 44, width: "auto" }} />
          <h1 className="font-display text-2xl text-white tracking-[0.15em] mt-1">NOBREZA</h1>
          {view === "dashboard" && (
            <div className="glass flex items-center gap-1 rounded-full px-1.5 py-1.5 mt-4">
              <button onClick={() => setCursor((c) => addMonths(c.y, c.m, -1))} aria-label="Mês anterior" className="w-7 h-7 rounded-full flex items-center justify-center">
                <ChevronLeft size={15} color="#FFFFFF" />
              </button>
              <span className="text-xs px-2 min-w-[8.5rem] text-center text-white">{monthLabel(cursor.y, cursor.m)}</span>
              <button onClick={() => setCursor((c) => addMonths(c.y, c.m, 1))} aria-label="Próximo mês" className="w-7 h-7 rounded-full flex items-center justify-center">
                <ChevronRight size={15} color="#FFFFFF" />
              </button>
            </div>
          )}
        </header>

        {view === "dashboard" && (<>
        {/* RESUMO DO MÊS */}
        <section className="glass p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Calendar color="#FFFFFF" size={18} />
            <h2 className="text-white font-semibold text-base">Resumo do mês</h2>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex-1 flex flex-col items-center border-r" style={{ borderColor: C.cardBorder }}>
              <span className="text-xs mb-1" style={{ color: C.muted }}>Entradas</span>
              <span className="text-white text-xl font-bold">{fmtBRL(income)}</span>
              <ArrowUpRight color={C.green} size={20} className="mt-1.5" />
            </div>
            <div className="flex-1 flex flex-col items-center border-r" style={{ borderColor: C.cardBorder }}>
              <span className="text-xs mb-1" style={{ color: C.muted }}>Gastos</span>
              <span className="text-white text-xl font-bold">{fmtBRL(spent)}</span>
              <ArrowDownRight color={C.pink} size={20} className="mt-1.5" />
            </div>
            <div className="flex-1 flex flex-col items-center">
              <span className="text-xs mb-1" style={{ color: C.muted }}>Saldo</span>
              <span className="text-white text-xl font-bold">{fmtBRL(balance)}</span>
              <Wallet color={C.cyan} size={20} className="mt-1.5" />
            </div>
          </div>
        </section>

        {/* ORÇAMENTO */}
        <section className="glass p-5 mb-6 flex items-center gap-4">
          <div className="w-11 h-11 rounded-full flex items-center justify-center shrink-0" style={{ background: "#FFFFFF1A" }}>
            <PieIcon size={18} color="#FFFFFF" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="text-white text-xl font-bold">{Math.round(pctSpent * 100)}%</span>
              <span className="text-xs" style={{ color: C.muted }}>do orçamento utilizado</span>
            </div>
            <div className="w-full h-2 rounded-full mt-2.5" style={{ background: "#FFFFFF1A" }}>
              <div className="h-2 rounded-full" style={{ width: `${pctSpent * 100}%`, background: `linear-gradient(90deg, ${C.pink}, ${C.gradBottom})` }} />
            </div>
            <p className="text-[11px] mt-1.5 truncate" style={{ color: C.muted }}>{fmtBRL(spent)} de {fmtBRL(income)}</p>
          </div>
        </section>

        {/* GASTOS POR CATEGORIA */}
        <section className="glass p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white font-semibold text-base">Gastos por categoria</h2>
          </div>
          {chartData.length === 0 ? (
            <p className="text-sm py-4" style={{ color: C.muted }}>Cadastre dívidas para ver a distribuição.</p>
          ) : (
            <div className="flex items-center gap-4">
              <div style={{ width: 128, height: 128 }} className="relative shrink-0">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={chartData} dataKey="value" nameKey="name" innerRadius={40} outerRadius={62} paddingAngle={3} strokeWidth={0}>
                      {chartData.map((entry) => <Cell key={entry.id} fill={entry.color} />)}
                    </Pie>
                    <Tooltip formatter={(v) => fmtBRL(v)} contentStyle={{ background: "#2D1B69", border: "1px solid #FFFFFF30", borderRadius: 8, color: "#fff" }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-white text-sm font-bold leading-tight">{fmtBRL(spent)}</span>
                  <span className="text-[10px]" style={{ color: C.muted }}>Total</span>
                </div>
              </div>
              <ul className="flex-1 flex flex-col gap-2.5 min-w-0">
                {chartData.map((c) => (
                  <li key={c.id} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: c.color }} />
                      <span className="truncate text-white">{c.name}</span>
                    </span>
                    <span className="text-xs shrink-0" style={{ color: C.muted }}>{spent > 0 ? Math.round((c.value / spent) * 100) : 0}%</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* EVOLUÇÃO DOS GASTOS */}
        <section className="glass p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white font-semibold text-base">Evolução dos gastos</h2>
            <span className="text-xs px-3 py-1 rounded-full text-white" style={{ background: "#FFFFFF1A" }}>6 meses</span>
          </div>
          <div style={{ width: "100%", height: 110 }}>
            <ResponsiveContainer>
              <LineChart data={evolution} margin={{ top: 6, right: 6, left: 6, bottom: 0 }}>
                <XAxis dataKey="label" tick={{ fill: C.muted, fontSize: 11 }} axisLine={{ stroke: "#FFFFFF30" }} tickLine={false} />
                <YAxis hide />
                <Tooltip formatter={(v) => fmtBRL(v)} contentStyle={{ background: "#2D1B69", border: "1px solid #FFFFFF30", borderRadius: 8, color: "#fff" }} labelStyle={{ color: "#fff" }} />
                <Line type="monotone" dataKey="value" stroke="#FFFFFF" strokeWidth={2} dot={{ r: 3, fill: "#FFFFFF" }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* ENTRADAS */}
        <section id="lancamentos" className="mb-6">
          <div className="flex items-center justify-between mb-3 px-1">
            <h2 className="text-white font-semibold text-base">Entradas</h2>
            <IconAdd onClick={() => setModal({ type: "entrada", editing: null })} />
          </div>
          {entradas.length === 0 ? (
            <p className="text-sm py-2 px-1" style={{ color: C.muted }}>Nenhuma entrada lançada este mês.</p>
          ) : (
            <ul>
              {entradas.map((e) => (
                <TxRow
                  key={e.id}
                  color={C.cyan}
                  icon={<ArrowUpRight size={16} color={C.cyan} />}
                  name={e.name}
                  subtitle="Entrada"
                  value={fmtBRL(e.amount)}
                  valueColor="#FFFFFF"
                  onClick={() => setModal({ type: "entrada", editing: e })}
                  onDelete={() => removeEntrada(e.id)}
                />
              ))}
            </ul>
          )}
        </section>

        {/* DÍVIDAS FIXAS */}
        <section className="mb-6">
          <div className="flex items-center justify-between mb-3 px-1">
            <h2 className="text-white font-semibold text-base">Dívidas fixas</h2>
            <IconAdd onClick={() => setModal({ type: "fixed", editing: null })} />
          </div>
          {data.fixedDebts.length === 0 ? (
            <p className="text-sm py-2 px-1" style={{ color: C.muted }}>Nenhuma dívida fixa cadastrada.</p>
          ) : (
            <ul>
              {data.fixedDebts.map((f) => (
                <TxRow
                  key={f.id}
                  color={catColor(data.categories, f.category)}
                  name={f.name}
                  subtitle={catLabel(data.categories, f.category)}
                  value={`- ${fmtBRL(f.amount)}`}
                  valueColor="#FFFFFF"
                  onClick={() => setModal({ type: "fixed", editing: f })}
                  onDelete={() => removeFixed(f.id)}
                />
              ))}
            </ul>
          )}
        </section>

        {/* PARCELAMENTOS */}
        <section className="mb-6">
          <div className="flex items-center justify-between mb-3 px-1">
            <h2 className="text-white font-semibold text-base">Parcelamentos</h2>
            <IconAdd onClick={() => setModal({ type: "parcela", editing: null })} />
          </div>
          {data.installments.length === 0 ? (
            <p className="text-sm py-2 px-1" style={{ color: C.muted }}>Nenhum parcelamento cadastrado.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {data.installments.map((p) => {
                const [sy, sm] = p.start.split("-").map(Number);
                const curIdx = cursor.y * 12 + (cursor.m - 1);
                const startIdx = sy * 12 + (sm - 1);
                const n = curIdx - startIdx + 1;
                const active = n >= 1 && n <= p.installments;
                const monthly = p.total / p.installments;
                const paidCount = Object.values(p.paid || {}).filter(Boolean).length;
                const quitado = paidCount >= p.installments;
                return (
                  <li key={p.id} className="glass p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2.5 min-w-0" onClick={() => setModal({ type: "parcela", editing: p })}>
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: catColor(data.categories, p.category) }} />
                        <div className="min-w-0">
                          <p className="text-white text-sm truncate">{p.name}</p>
                          <p className="text-[11px]" style={{ color: quitado ? C.green : C.muted }}>{quitado ? "quitado" : `${paidCount}/${p.installments} pagas`}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-white text-sm font-semibold">{active ? `- ${fmtBRL(monthly)}` : fmtBRL(monthly)}</span>
                        <RowActions onEdit={() => setModal({ type: "parcela", editing: p })} onDelete={() => removeInstallment(p.id)} />
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {Array.from({ length: p.installments }, (_, i) => i + 1).map((idx) => {
                        const isPaid = !!p.paid?.[idx];
                        const isDue = idx === n && !isPaid;
                        return (
                          <button
                            key={idx}
                            onClick={() => toggleParcel(p.id, idx)}
                            title={`Parcela ${idx}`}
                            style={{
                              width: 14, height: 14, borderRadius: "50%",
                              background: isPaid ? C.green : "transparent",
                              border: `1.5px solid ${isPaid ? C.green : isDue ? C.yellow : "#FFFFFF40"}`,
                            }}
                          />
                        );
                      })}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        </>)}

        {view === "metas" && (
          <MetasView
            goals={data.goals}
            onAdd={() => setModal({ type: "goal", editing: null })}
            onEdit={(g) => setModal({ type: "goal", editing: g })}
            onDelete={removeGoal}
          />
        )}

        {view === "categorias" && (
          <CategoriasView
            categories={data.categories}
            onChange={editCategory}
            overview={overview}
            confirmReset={confirmReset}
            onAskReset={() => setConfirmReset(true)}
            onCancelReset={() => setConfirmReset(false)}
            onConfirmReset={resetAllData}
          />
        )}
      </div>

      {/* NAVEGAÇÃO INFERIOR */}
      <nav
        className="fixed bottom-0 left-0 right-0 flex items-center justify-around px-4 pb-2 pt-3 z-40"
        style={{ background: `${C.navBg}CC`, backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)", borderTop: "1px solid #FFFFFF1A" }}
      >
        <NavItem icon={<Home size={22} />} label="Home" active={view === "dashboard"} onClick={() => { setView("dashboard"); document.getElementById("top")?.scrollIntoView({ behavior: "smooth" }); }} />
        <NavItem
          icon={<PlusCircle size={22} />}
          label="Adicionar"
          onClick={() => { if (view === "metas") setModal({ type: "goal", editing: null }); else { setView("dashboard"); setAddMenuOpen(true); } }}
        />
        <NavItem icon={<List size={22} />} label="Lançamentos" active={false} onClick={() => { setView("dashboard"); setTimeout(() => document.getElementById("lancamentos")?.scrollIntoView({ behavior: "smooth" }), 50); }} />
        <NavItem icon={<Target size={22} />} label="Metas" active={view === "metas"} onClick={() => setView("metas")} />
        <NavItem icon={<Palette size={22} />} label="Categorias" active={view === "categorias"} onClick={() => setView("categorias")} />
      </nav>

      {toast && <Toast message={toast} onDone={() => setToast(null)} />}

      {addMenuOpen && (
        <AddMenu
          onClose={() => setAddMenuOpen(false)}
          onPick={(type) => { setAddMenuOpen(false); setModal({ type, editing: null }); }}
        />
      )}

      {modal?.type === "entrada" && (
        <EntradaModal key={modal.editing?.id || "new-entrada"} editing={modal.editing} onClose={() => setModal(null)} onSave={(item) => saveEntrada(item, modal.editing?.id)} />
      )}
      {modal?.type === "fixed" && (
        <FixedModal key={modal.editing?.id || "new-fixed"} editing={modal.editing} categories={data.categories} onClose={() => setModal(null)} onSave={(item) => saveFixed(item, modal.editing?.id)} />
      )}
      {modal?.type === "parcela" && (
        <ParcelaModal key={modal.editing?.id || "new-parcela"} editing={modal.editing} defaultStart={mk} categories={data.categories} onClose={() => setModal(null)} onSave={(item) => saveInstallment(item, modal.editing?.id)} />
      )}
      {modal?.type === "goal" && (
        <GoalModal key={modal.editing?.id || "new-goal"} editing={modal.editing} onClose={() => setModal(null)} onSave={(item) => saveGoal(item, modal.editing?.id)} />
      )}
    </div>
  );
}

/* ============ componentes auxiliares ============ */

/* ============ tela: Metas ============ */
function MetasView({ goals, onAdd, onEdit, onDelete }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4 mt-2">
        <h2 className="text-white font-semibold text-lg">Metas de economia</h2>
        <IconAdd onClick={onAdd} />
      </div>
      {goals.length === 0 ? (
        <div className="glass p-6 text-center">
          <Target size={28} color="#FFFFFF80" className="mx-auto mb-2" />
          <p className="text-sm" style={{ color: C.muted }}>
            Nenhuma meta ainda. Crie uma pra juntar dinheiro pra alguma coisa — viagem, reserva, o que for.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {goals.map((g) => {
            const pct = g.target > 0 ? Math.min(g.saved / g.target, 1) : 0;
            const done = g.saved >= g.target && g.target > 0;
            return (
              <li key={g.id} className="glass p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="min-w-0 cursor-pointer" onClick={() => onEdit(g)}>
                    <p className="text-white text-sm font-medium truncate">{g.name}</p>
                    <p className="text-[11px]" style={{ color: done ? C.green : C.muted }}>
                      {done ? "meta atingida 🎉" : `${fmtBRL(g.saved)} de ${fmtBRL(g.target)}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-white text-sm font-semibold">{Math.round(pct * 100)}%</span>
                    <RowActions onEdit={() => onEdit(g)} onDelete={() => onDelete(g.id)} />
                  </div>
                </div>
                <div className="w-full h-2 rounded-full" style={{ background: "#FFFFFF1A" }}>
                  <div className="h-2 rounded-full" style={{ width: `${pct * 100}%`, background: done ? C.green : `linear-gradient(90deg, ${C.pink}, ${C.gradBottom})` }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ============ tela: Perfil / Resumo & Ajustes ============ */
function CategoriasView({ categories, onChange, overview, confirmReset, onAskReset, onCancelReset, onConfirmReset }) {
  return (
    <div>
      <h2 className="text-white font-semibold text-lg mb-1 mt-2">Categorias</h2>
      <p className="text-xs mb-4" style={{ color: C.muted }}>Personalize o nome e a cor de cada categoria de gasto.</p>

      <ul className="flex flex-col gap-2.5 mb-6">
        {categories.map((c) => (
          <li key={c.id} className="glass p-3.5 flex items-center gap-3">
            <label className="relative shrink-0 w-9 h-9 rounded-full" style={{ background: c.color, cursor: "pointer" }}>
              <input
                type="color"
                value={c.color}
                onChange={(e) => onChange(c.id, { color: e.target.value })}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                aria-label={`Cor de ${c.label}`}
              />
            </label>
            <input
              value={c.label}
              onChange={(e) => onChange(c.id, { label: e.target.value })}
              className="flex-1 min-w-0 bg-transparent text-white text-sm py-2 border-b"
              style={{ borderColor: "#FFFFFF20" }}
            />
          </li>
        ))}
      </ul>

      <div className="glass p-6 mb-4">
        <div className="flex items-center justify-between py-2">
          <span className="text-sm" style={{ color: C.muted }}>Total economizado</span>
          <span className="text-white text-lg font-bold">{fmtBRL(overview.totalSaved)}</span>
        </div>
        <div className="w-full h-px my-1" style={{ background: "#FFFFFF1A" }} />
        <div className="flex items-center justify-between py-2">
          <span className="text-sm" style={{ color: C.muted }}>Meses com histórico</span>
          <span className="text-white text-lg font-bold">{overview.monthsTracked}</span>
        </div>
      </div>

      <div className="glass p-6">
        <p className="text-white font-medium mb-1">Dados do app</p>
        <p className="text-xs mb-4" style={{ color: C.muted }}>
          Seus dados ficam salvos só neste aparelho, no navegador.
        </p>
        {!confirmReset ? (
          <button onClick={onAskReset} className="w-full rounded-lg py-2.5 text-sm font-semibold" style={{ background: "#FFFFFF14", color: "#FF6B6B", border: "1px solid #FF6B6B40" }}>
            Limpar todos os dados
          </button>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-center" style={{ color: "#FF9E9E" }}>Isso apaga entradas, dívidas, parcelas e metas. Não dá pra desfazer.</p>
            <div className="flex gap-2">
              <button onClick={onCancelReset} className="flex-1 rounded-lg py-2.5 text-sm font-semibold text-white" style={{ background: "#FFFFFF1A" }}>Cancelar</button>
              <button onClick={onConfirmReset} className="flex-1 rounded-lg py-2.5 text-sm font-semibold text-white" style={{ background: "#FF6B6B" }}>Sim, apagar tudo</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function IconAdd({ onClick }) {
  return (
    <button onClick={onClick} aria-label="Adicionar" className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "#FFFFFF1A", border: `1px solid ${C.cardBorder}` }}>
      <Plus size={15} color="#FFFFFF" />
    </button>
  );
}

function RowActions({ onEdit, onDelete }) {
  return (
    <div className="flex items-center gap-2">
      <button onClick={(e) => { e.stopPropagation(); onEdit(); }} aria-label="Editar"><Pencil size={13} color={C.muted} /></button>
      <button onClick={(e) => { e.stopPropagation(); onDelete(); }} aria-label="Remover"><Trash2 size={13} color={C.muted} /></button>
    </div>
  );
}

function TxRow({ color, icon, name, subtitle, value, onClick, onDelete }) {
  return (
    <li onClick={onClick} className="glass row-hover flex items-center justify-between p-3.5 mb-2 cursor-pointer">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ background: `${color}26` }}>
          {icon || <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />}
        </div>
        <div className="min-w-0">
          <p className="text-white text-sm font-medium truncate">{name}</p>
          <p className="text-[11px] truncate" style={{ color: C.muted }}>{subtitle}</p>
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span className="text-white text-sm font-semibold">{value}</span>
        <RowActions onEdit={onClick} onDelete={onDelete} />
      </div>
    </li>
  );
}

function NavItem({ icon, label, active, onClick }) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1">
      <span style={{ color: active ? "#FFFFFF" : "#D1D5DB", filter: active ? "drop-shadow(0 0 8px #FFFFFF80)" : "none" }}>{icon}</span>
      <span className="text-[10px]" style={{ color: active ? "#FFFFFF" : "#D1D5DB" }}>{label}</span>
    </button>
  );
}

function Toast({ message, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2000);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full text-sm text-white" style={{ background: "#2D1B69EE", border: "1px solid #FFFFFF30" }}>
      {message}
    </div>
  );
}

function AddMenu({ onClose, onPick }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "#00000066" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-t-3xl p-6 pb-8" style={{ background: C.navBg, borderTop: "1px solid #FFFFFF20" }}>
        <div className="w-10 h-1 rounded-full mx-auto mb-5" style={{ background: "#FFFFFF30" }} />
        <h3 className="text-white font-semibold mb-4">O que você quer adicionar?</h3>
        <div className="flex flex-col gap-2.5">
          <button onClick={() => onPick("entrada")} className="glass p-4 text-left text-white flex items-center gap-3">
            <ArrowUpRight color={C.cyan} size={18} /> Entrada
          </button>
          <button onClick={() => onPick("fixed")} className="glass p-4 text-left text-white flex items-center gap-3">
            <ArrowDownRight color={C.pink} size={18} /> Dívida fixa
          </button>
          <button onClick={() => onPick("parcela")} className="glass p-4 text-left text-white flex items-center gap-3">
            <List color={C.yellow} size={18} /> Parcelamento
          </button>
        </div>
      </div>
    </div>
  );
}

function CentavosInput({ initialReais = 0, onChange, autoFocus }) {
  const [cents, setCents] = useState(Math.round((initialReais || 0) * 100));
  const display = (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const handle = (e) => {
    const digits = e.target.value.replace(/\D/g, "");
    const c = digits === "" ? 0 : parseInt(digits, 10);
    setCents(c);
    onChange(c / 100);
  };
  return (
    <input value={display} onChange={handle} inputMode="numeric" autoFocus={autoFocus} placeholder="0,00"
      className="bg-transparent w-full text-white text-sm" style={{ caretColor: "#fff" }} />
  );
}

function ModalShell({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "#00000077" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="glass w-full max-w-sm p-6" style={{ background: "#3A1F8FEE" }}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-white font-semibold text-lg">{title}</h3>
          <button onClick={onClose} aria-label="Fechar"><X size={16} color={C.muted} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function FieldLabel({ children }) {
  return <label className="text-xs uppercase tracking-wide block mb-1.5" style={{ color: C.muted }}>{children}</label>;
}
const fieldStyle = { background: "#FFFFFF14", border: `1px solid ${C.cardBorder}` };

function EntradaModal({ onClose, onSave, editing }) {
  const [name, setName] = useState(editing?.name || "");
  const [amount, setAmount] = useState(editing?.amount || 0);
  const submit = () => { if (!name.trim() || !amount || amount <= 0) return; onSave({ name: name.trim(), amount }); };
  return (
    <ModalShell title={editing ? "Editar entrada" : "Nova entrada"} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div><FieldLabel>Origem</FieldLabel>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Salário, freela..." autoFocus className="w-full rounded-lg px-3 py-2 text-sm text-white" style={fieldStyle} />
        </div>
        <div><FieldLabel>Valor</FieldLabel>
          <div className="w-full rounded-lg px-3 py-2 flex items-center gap-2" style={fieldStyle}>
            <span className="text-sm" style={{ color: C.muted }}>R$</span>
            <CentavosInput initialReais={amount} onChange={setAmount} />
          </div>
        </div>
        <button onClick={submit} className="rounded-lg py-2.5 text-sm font-semibold mt-1 text-white" style={{ background: `linear-gradient(90deg, ${C.pink}, ${C.gradBottom})` }}>
          {editing ? "Salvar alterações" : "Salvar entrada"}
        </button>
      </div>
    </ModalShell>
  );
}

function FixedModal({ onClose, onSave, editing, categories }) {
  const [name, setName] = useState(editing?.name || "");
  const [category, setCategory] = useState(editing?.category || categories[0].id);
  const [amount, setAmount] = useState(editing?.amount || 0);
  const submit = () => { if (!name.trim() || !amount || amount <= 0) return; onSave({ name: name.trim(), category, amount }); };
  return (
    <ModalShell title={editing ? "Editar dívida fixa" : "Nova dívida fixa"} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div><FieldLabel>Nome</FieldLabel>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Aluguel" autoFocus className="w-full rounded-lg px-3 py-2 text-sm text-white" style={fieldStyle} />
        </div>
        <div><FieldLabel>Categoria</FieldLabel>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm text-white" style={fieldStyle}>
            {categories.map((c) => <option key={c.id} value={c.id} style={{ color: "#000" }}>{c.label}</option>)}
          </select>
        </div>
        <div><FieldLabel>Valor mensal</FieldLabel>
          <div className="w-full rounded-lg px-3 py-2 flex items-center gap-2" style={fieldStyle}>
            <span className="text-sm" style={{ color: C.muted }}>R$</span>
            <CentavosInput initialReais={amount} onChange={setAmount} />
          </div>
        </div>
        <button onClick={submit} className="rounded-lg py-2.5 text-sm font-semibold mt-1 text-white" style={{ background: `linear-gradient(90deg, ${C.pink}, ${C.gradBottom})` }}>
          {editing ? "Salvar alterações" : "Salvar dívida"}
        </button>
      </div>
    </ModalShell>
  );
}

function ParcelaModal({ onClose, onSave, defaultStart, editing, categories }) {
  const [name, setName] = useState(editing?.name || "");
  const [category, setCategory] = useState(editing?.category || categories[0].id);
  const [total, setTotal] = useState(editing?.total || 0);
  const [installments, setInstallments] = useState(editing ? String(editing.installments) : "");
  const [start, setStart] = useState(editing?.start || defaultStart);
  const submit = () => {
    const n = parseInt(installments, 10);
    if (!name.trim() || !total || total <= 0 || !n || n <= 0 || !/^\d{4}-\d{2}$/.test(start)) return;
    let paid = editing?.paid;
    if (editing && n < editing.installments) paid = Object.fromEntries(Object.entries(editing.paid || {}).filter(([k]) => Number(k) <= n));
    onSave({ name: name.trim(), category, total, installments: n, start, ...(paid ? { paid } : {}) });
  };
  return (
    <ModalShell title={editing ? "Editar parcelamento" : "Novo parcelamento"} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div><FieldLabel>Nome</FieldLabel>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Sofá novo" autoFocus className="w-full rounded-lg px-3 py-2 text-sm text-white" style={fieldStyle} />
        </div>
        <div><FieldLabel>Categoria</FieldLabel>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm text-white" style={fieldStyle}>
            {categories.map((c) => <option key={c.id} value={c.id} style={{ color: "#000" }}>{c.label}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><FieldLabel>Valor total</FieldLabel>
            <div className="w-full rounded-lg px-3 py-2 flex items-center gap-2" style={fieldStyle}>
              <span className="text-sm" style={{ color: C.muted }}>R$</span>
              <CentavosInput initialReais={total} onChange={setTotal} />
            </div>
          </div>
          <div><FieldLabel>Nº de parcelas</FieldLabel>
            <input value={installments} onChange={(e) => setInstallments(e.target.value.replace(/\D/g, ""))} placeholder="12" inputMode="numeric" className="w-full rounded-lg px-3 py-2 text-sm text-white" style={fieldStyle} />
          </div>
        </div>
        <div><FieldLabel>1ª parcela em</FieldLabel>
          <input type="month" value={start} onChange={(e) => setStart(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm text-white" style={fieldStyle} />
        </div>
        <button onClick={submit} className="rounded-lg py-2.5 text-sm font-semibold mt-1 text-white" style={{ background: `linear-gradient(90deg, ${C.pink}, ${C.gradBottom})` }}>
          {editing ? "Salvar alterações" : "Salvar parcelamento"}
        </button>
      </div>
    </ModalShell>
  );
}

function GoalModal({ onClose, onSave, editing }) {
  const [name, setName] = useState(editing?.name || "");
  const [target, setTarget] = useState(editing?.target || 0);
  const [saved, setSaved] = useState(editing?.saved || 0);
  const submit = () => {
    if (!name.trim() || !target || target <= 0) return;
    onSave({ name: name.trim(), target, saved: saved || 0 });
  };
  return (
    <ModalShell title={editing ? "Editar meta" : "Nova meta"} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div><FieldLabel>Nome da meta</FieldLabel>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Viagem, reserva de emergência..." autoFocus className="w-full rounded-lg px-3 py-2 text-sm text-white" style={fieldStyle} />
        </div>
        <div><FieldLabel>Valor alvo</FieldLabel>
          <div className="w-full rounded-lg px-3 py-2 flex items-center gap-2" style={fieldStyle}>
            <span className="text-sm" style={{ color: C.muted }}>R$</span>
            <CentavosInput initialReais={target} onChange={setTarget} />
          </div>
        </div>
        <div><FieldLabel>Já guardado até agora</FieldLabel>
          <div className="w-full rounded-lg px-3 py-2 flex items-center gap-2" style={fieldStyle}>
            <span className="text-sm" style={{ color: C.muted }}>R$</span>
            <CentavosInput initialReais={saved} onChange={setSaved} />
          </div>
        </div>
        <button onClick={submit} className="rounded-lg py-2.5 text-sm font-semibold mt-1 text-white" style={{ background: `linear-gradient(90deg, ${C.pink}, ${C.gradBottom})` }}>
          {editing ? "Salvar alterações" : "Salvar meta"}
        </button>
      </div>
    </ModalShell>
  );
}
