import { useState, useEffect, useRef, useMemo } from "react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from "recharts";
import {
  Search, BookOpen, TrendingUp, Globe, Award,
  Quote, Share2, Users, Loader2
} from "lucide-react";
import * as d3 from "d3";

// ── design tokens ─────────────────────────────────────────────────────────────
const BG    = "#040c18";
const CARD  = "#080f1e";
const CARD2 = "#0c1628";
const BORD  = "#152237";
const AMBER = "#e8a020";
const BLUE  = "#38bdf8";
const GREEN = "#34d399";
const PURPLE= "#a78bfa";
const TEXT  = "#64748b";
const TEXTH = "#e2e8f0";
const PAL   = [AMBER, BLUE, GREEN, PURPLE, "#fb923c", "#f472b6"];

const mono = "'Space Mono', monospace";
const syne = "'Syne', sans-serif";

// ── helpers ───────────────────────────────────────────────────────────────────
function hIndex(works) {
  const c = works.map(w => w.cited_by_count ?? 0).sort((a, b) => b - a);
  let h = 0;
  for (let i = 0; i < c.length; i++) { if (c[i] >= i + 1) h = i + 1; else break; }
  return h;
}

async function fetchWorks(q) {
  const url = `https://api.openalex.org/works?search=${encodeURIComponent(q)}&per-page=200&sort=cited_by_count:desc&mailto=app@bibliometria.io`;
  const r = await fetch(url);
  if (!r.ok) throw new Error("API error");
  return (await r.json()).results ?? [];
}

// ── tiny components ───────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, sub, color = AMBER }) {
  return (
    <div style={{ background: CARD2, border: `1px solid ${BORD}`, borderRadius: 12, padding: "18px 22px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: `${color}18`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon size={16} color={color} />
        </div>
        <span style={{ fontSize: 10, color: TEXT, fontFamily: mono, textTransform: "uppercase", letterSpacing: 2 }}>{label}</span>
      </div>
      <div style={{ fontSize: 30, fontWeight: 800, color: TEXTH, fontFamily: syne }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: TEXT, marginTop: 4, fontFamily: mono }}>{sub}</div>}
    </div>
  );
}

function Tab({ id, label, icon: Icon, active, onClick }) {
  return (
    <button onClick={() => onClick(id)} style={{
      display: "flex", alignItems: "center", gap: 6, padding: "9px 16px",
      borderRadius: "8px 8px 0 0", border: "none", cursor: "pointer", fontSize: 12,
      fontFamily: mono, background: active ? CARD2 : "transparent",
      color: active ? AMBER : TEXT,
      borderBottom: active ? `2px solid ${AMBER}` : `2px solid transparent`,
      transition: "all 0.2s"
    }}>
      <Icon size={13} />{label}
    </button>
  );
}

function Box({ title, children }) {
  return (
    <div style={{ background: CARD2, border: `1px solid ${BORD}`, borderRadius: 12, padding: 24, marginBottom: 16 }}>
      <div style={{ fontSize: 13, color: TEXT, fontFamily: mono, textTransform: "uppercase", letterSpacing: 2, marginBottom: 20 }}>{title}</div>
      {children}
    </div>
  );
}

function Empty({ msg }) {
  return <div style={{ padding: 60, textAlign: "center", color: TEXT, fontFamily: mono, fontSize: 12 }}>{msg}</div>;
}

const TTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: CARD, border: `1px solid ${BORD}`, borderRadius: 8, padding: "8px 14px" }}>
      <div style={{ color: TEXT, fontSize: 10, fontFamily: mono }}>{label}</div>
      <div style={{ color: AMBER, fontSize: 18, fontWeight: 800, fontFamily: syne }}>{payload[0].value?.toLocaleString?.() ?? payload[0].value}</div>
    </div>
  );
};

// ── word cloud ────────────────────────────────────────────────────────────────
function WordCloud({ data }) {
  if (!data.length) return <Empty msg="Sem palavras-chave." />;
  const max = data[0].count;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 14px", padding: 8 }}>
      {data.map(({ word, count }) => {
        const r = count / max;
        const size = 11 + Math.round(r * 26);
        const color = PAL[Math.floor(r * (PAL.length - 1))];
        return (
          <span key={word} title={`${count} ocorrências`} style={{
            fontSize: size, color, opacity: 0.4 + r * 0.6,
            fontFamily: mono, lineHeight: 1.5, cursor: "default"
          }}>
            {word}
          </span>
        );
      })}
    </div>
  );
}

// ── coauthor network ──────────────────────────────────────────────────────────
function Network({ data }) {
  const svgRef = useRef(null);

  useEffect(() => {
    if (!data.nodes.length || !svgRef.current) return;
    const el = svgRef.current;
    const svg = d3.select(el);
    svg.selectAll("*").remove();

    const W = el.clientWidth || 800;
    const H = 480;
    const rScale = d3.scaleSqrt().domain([1, d3.max(data.nodes, d => d.papers) || 1]).range([5, 20]);

    const sim = d3.forceSimulation(data.nodes)
      .force("link", d3.forceLink(data.links).id(d => d.id).distance(90).strength(0.4))
      .force("charge", d3.forceManyBody().strength(-150))
      .force("center", d3.forceCenter(W / 2, H / 2))
      .force("collision", d3.forceCollide(d => rScale(d.papers) + 5));

    const g = svg.append("g");
    svg.call(d3.zoom().scaleExtent([0.2, 4]).on("zoom", e => g.attr("transform", e.transform)));

    const link = g.append("g").selectAll("line").data(data.links).join("line")
      .attr("stroke", BORD).attr("stroke-width", d => Math.min(d.value + 1, 5)).attr("stroke-opacity", 0.7);

    const drag = d3.drag()
      .on("start", (e, d) => { if (!e.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
      .on("drag", (e, d) => { d.fx = e.x; d.fy = e.y; })
      .on("end", (e, d) => { if (!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null; });

    const node = g.append("g").selectAll("g").data(data.nodes).join("g").call(drag);

    node.append("circle")
      .attr("r", d => rScale(d.papers))
      .attr("fill", (_, i) => PAL[i % PAL.length])
      .attr("fill-opacity", 0.85)
      .attr("stroke", "#040c18").attr("stroke-width", 1.5);

    node.append("text")
      .text(d => d.id.split(" ").slice(-1)[0])
      .attr("dy", d => rScale(d.papers) + 11)
      .attr("text-anchor", "middle")
      .attr("font-size", 9)
      .attr("fill", TEXT)
      .attr("font-family", mono);

    node.append("title").text(d => `${d.id}\n${d.papers} artigos · ${d.citations.toLocaleString()} citações`);

    sim.on("tick", () => {
      link.attr("x1", d => d.source.x).attr("y1", d => d.source.y)
          .attr("x2", d => d.target.x).attr("y2", d => d.target.y);
      node.attr("transform", d => `translate(${d.x ?? 0},${d.y ?? 0})`);
    });

    return () => sim.stop();
  }, [data]);

  if (!data.nodes.length) return <Empty msg="Nenhuma conexão de coautoria encontrada." />;

  return (
    <>
      <div style={{ fontSize: 10, color: TEXT, fontFamily: mono, marginBottom: 10 }}>
        {data.nodes.length} autores · {data.links.length} conexões · scroll para zoom · arraste para mover
      </div>
      <svg ref={svgRef} width="100%" height={480}
        style={{ background: BG, borderRadius: 10, border: `1px solid ${BORD}`, display: "block" }} />
    </>
  );
}

// ── main app ──────────────────────────────────────────────────────────────────
export default function Bibliometria() {
  const [input, setInput]   = useState("");
  const [works, setWorks]   = useState([]);
  const [loading, setLoad]  = useState(false);
  const [error, setError]   = useState(null);
  const [query, setQuery]   = useState("");
  const [tab, setTab]       = useState("overview");

  // inject fonts
  useEffect(() => {
    const el = document.createElement("link");
    el.rel = "stylesheet";
    el.href = "https://fonts.googleapis.com/css2?family=Space+Mono:ital,wght@0,400;0,700;1,400&family=Syne:wght@400;600;700;800&display=swap";
    document.head.appendChild(el);
  }, []);

  const doSearch = async () => {
    if (!input.trim()) return;
    setLoad(true); setError(null);
    try {
      const res = await fetchWorks(input.trim());
      setWorks(res); setQuery(input.trim()); setTab("overview");
    } catch {
      setError("Não foi possível conectar à API OpenAlex. Verifique sua conexão.");
    } finally { setLoad(false); }
  };

  // ── derived data ──────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    if (!works.length) return null;
    const totalCit = works.reduce((s, w) => s + (w.cited_by_count ?? 0), 0);
    const years = works.map(w => w.publication_year).filter(Boolean);
    const oa = works.filter(w => w.open_access?.is_oa).length;
    return { total: works.length, totalCit, hIdx: hIndex(works), minYear: Math.min(...years), maxYear: Math.max(...years), oa };
  }, [works]);

  const timeline = useMemo(() => {
    const m = {};
    works.forEach(w => { if (w.publication_year) m[w.publication_year] = (m[w.publication_year] || 0) + 1; });
    return Object.entries(m).sort(([a], [b]) => +a - +b).map(([year, count]) => ({ year: +year, count }));
  }, [works]);

  const keywords = useMemo(() => {
    const m = {};
    works.forEach(w => (w.concepts || []).slice(0, 6).forEach(c => { m[c.display_name] = (m[c.display_name] || 0) + 1; }));
    return Object.entries(m).sort(([, a], [, b]) => b - a).slice(0, 60).map(([word, count]) => ({ word, count }));
  }, [works]);

  const authors = useMemo(() => {
    const m = {};
    works.forEach(w => (w.authorships || []).forEach(a => {
      const n = a.author?.display_name; if (!n) return;
      if (!m[n]) m[n] = { name: n, papers: 0, citations: 0 };
      m[n].papers++; m[n].citations += w.cited_by_count ?? 0;
    }));
    return Object.values(m).sort((a, b) => b.papers - a.papers).slice(0, 12);
  }, [works]);

  const journals = useMemo(() => {
    const m = {};
    works.forEach(w => { const n = w.primary_location?.source?.display_name; if (n) m[n] = (m[n] || 0) + 1; });
    return Object.entries(m).sort(([, a], [, b]) => b - a).slice(0, 10)
      .map(([name, count]) => ({ name: name.length > 38 ? name.slice(0, 38) + "…" : name, count }));
  }, [works]);

  const countries = useMemo(() => {
    const m = {};
    works.forEach(w => (w.authorships || []).forEach(a =>
      (a.institutions || []).forEach(i => { if (i.country_code) m[i.country_code] = (m[i.country_code] || 0) + 1; })));
    return Object.entries(m).sort(([, a], [, b]) => b - a).slice(0, 12).map(([name, count]) => ({ name, count }));
  }, [works]);

  const topCited = useMemo(() => [...works].sort((a, b) => (b.cited_by_count ?? 0) - (a.cited_by_count ?? 0)).slice(0, 15), [works]);

  const network = useMemo(() => {
    const am = {};
    works.forEach(w => (w.authorships || []).forEach(a => {
      const n = a.author?.display_name; if (!n) return;
      if (!am[n]) am[n] = { id: n, papers: 0, citations: 0 };
      am[n].papers++; am[n].citations += w.cited_by_count ?? 0;
    }));
    const nodes = Object.values(am).sort((a, b) => b.papers - a.papers).slice(0, 40);
    const topSet = new Set(nodes.map(n => n.id));
    const lm = {};
    works.forEach(w => {
      const as = (w.authorships || []).map(a => a.author?.display_name).filter(n => n && topSet.has(n));
      for (let i = 0; i < as.length; i++)
        for (let j = i + 1; j < as.length; j++) {
          const k = [as[i], as[j]].sort().join("||");
          lm[k] = (lm[k] || 0) + 1;
        }
    });
    const links = Object.entries(lm).map(([k, v]) => { const [s, t] = k.split("||"); return { source: s, target: t, value: v }; });
    return { nodes, links };
  }, [works]);

  // ── tabs config ───────────────────────────────────────────────────────────
  const TABS = [
    { id: "overview",  label: "Visão Geral",  icon: BookOpen },
    { id: "timeline",  label: "Evolução",     icon: TrendingUp },
    { id: "keywords",  label: "Palavras",     icon: Globe },
    { id: "rankings",  label: "Rankings",     icon: Award },
    { id: "citations", label: "Citações",     icon: Quote },
    { id: "network",   label: "Rede",         icon: Share2 },
  ];

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: BG, fontFamily: syne, color: TEXTH }}>

      {/* ── header ── */}
      <div style={{ background: `linear-gradient(180deg, #020810 0%, ${BG} 100%)`, borderBottom: `1px solid ${BORD}`, padding: "36px 24px 28px" }}>
        <div style={{ maxWidth: 940, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginBottom: 4 }}>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: TEXTH, margin: 0 }}>Bibliometria</h1>
            <span style={{ fontSize: 10, color: AMBER, fontFamily: mono, letterSpacing: 3, textTransform: "uppercase" }}>powered by OpenAlex</span>
          </div>
          <p style={{ color: TEXT, fontSize: 12, marginBottom: 22, fontFamily: mono }}>Análise bibliométrica de publicações científicas em tempo real</p>

          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1, position: "relative" }}>
              <Search size={15} color={TEXT} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && doSearch()}
                placeholder="Ex: machine learning, CRISPR, climate change, deep learning..."
                style={{
                  width: "100%", padding: "13px 14px 13px 42px",
                  background: CARD, border: `1px solid ${BORD}`, borderRadius: 10,
                  color: TEXTH, fontSize: 13, fontFamily: mono,
                  outline: "none", boxSizing: "border-box"
                }}
              />
            </div>
            <button
              onClick={doSearch}
              disabled={loading}
              style={{
                padding: "13px 28px", background: AMBER, border: "none", borderRadius: 10,
                color: "#020810", fontWeight: 700, fontSize: 13, cursor: "pointer",
                fontFamily: syne, display: "flex", alignItems: "center", gap: 8,
                opacity: loading ? 0.6 : 1, whiteSpace: "nowrap"
              }}
            >
              {loading
                ? <><Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} /> Buscando…</>
                : <><Search size={15} /> Analisar</>}
            </button>
          </div>
          {error && <div style={{ color: "#f87171", fontSize: 12, marginTop: 10, fontFamily: mono }}>{error}</div>}
        </div>
      </div>

      {/* ── body ── */}
      <div style={{ maxWidth: 940, margin: "0 auto", padding: "24px" }}>

        {/* empty state */}
        {!works.length && !loading && (
          <div style={{ textAlign: "center", padding: "100px 0", color: TEXT }}>
            <BookOpen size={44} color={BORD} style={{ marginBottom: 14 }} />
            <p style={{ fontFamily: mono, fontSize: 12, lineHeight: 2 }}>
              Digite um termo científico e clique em <strong style={{ color: AMBER }}>Analisar</strong>.<br />
              Os dados são obtidos gratuitamente via API OpenAlex.
            </p>
          </div>
        )}

        {works.length > 0 && (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
              <span style={{ color: TEXT, fontFamily: mono, fontSize: 11 }}>
                Resultados para: <span style={{ color: AMBER }}>"{query}"</span>
              </span>
              <span style={{ color: TEXT, fontFamily: mono, fontSize: 11 }}>{works.length} publicações analisadas</span>
            </div>

            {/* tabs */}
            <div style={{ display: "flex", gap: 2, marginBottom: 24, flexWrap: "wrap", borderBottom: `1px solid ${BORD}` }}>
              {TABS.map(t => <Tab key={t.id} {...t} active={tab === t.id} onClick={setTab} />)}
            </div>

            {/* ── overview ── */}
            {tab === "overview" && stats && (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 16 }}>
                  <StatCard icon={BookOpen} label="Publicações"   value={stats.total}                               sub={`${stats.minYear} – ${stats.maxYear}`} />
                  <StatCard icon={Quote}    label="Citações"      value={stats.totalCit.toLocaleString("pt-BR")}     color={BLUE} />
                  <StatCard icon={Award}    label="h-index"       value={stats.hIdx}                                 color={GREEN} />
                  <StatCard icon={Users}    label="Open Access"   value={`${Math.round(stats.oa / stats.total * 100)}%`} color={PURPLE} sub={`${stats.oa} artigos`} />
                </div>

                <Box title="Artigos mais citados">
                  {topCited.map((w, i) => (
                    <div key={i} style={{ display: "flex", gap: 12, padding: "10px 0", borderBottom: `1px solid ${BORD}`, alignItems: "flex-start" }}>
                      <span style={{ fontSize: 11, color: AMBER, fontFamily: mono, minWidth: 22, paddingTop: 2, flexShrink: 0 }}>#{i + 1}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <a href={w.doi || w.id} target="_blank" rel="noopener noreferrer"
                          style={{ color: TEXTH, fontSize: 13, textDecoration: "none", fontWeight: 600, lineHeight: 1.4, display: "block" }}>
                          {w.title || "Sem título"}
                        </a>
                        <span style={{ color: TEXT, fontSize: 10, fontFamily: mono }}>
                          {w.publication_year} · {(w.cited_by_count ?? 0).toLocaleString("pt-BR")} citações
                          {w.primary_location?.source?.display_name ? ` · ${w.primary_location.source.display_name}` : ""}
                        </span>
                      </div>
                    </div>
                  ))}
                </Box>
              </>
            )}

            {/* ── timeline ── */}
            {tab === "timeline" && (
              <Box title="Evolução temporal das publicações">
                <ResponsiveContainer width="100%" height={340}>
                  <AreaChart data={timeline} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="ag" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor={AMBER} stopOpacity={0.25} />
                        <stop offset="95%" stopColor={AMBER} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={BORD} />
                    <XAxis dataKey="year" stroke={TEXT} tick={{ fontSize: 10, fontFamily: mono }} />
                    <YAxis stroke={TEXT} tick={{ fontSize: 10, fontFamily: mono }} />
                    <Tooltip content={<TTip />} />
                    <Area type="monotone" dataKey="count" stroke={AMBER} strokeWidth={2} fill="url(#ag)" dot={{ fill: AMBER, r: 3 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </Box>
            )}

            {/* ── keywords ── */}
            {tab === "keywords" && (
              <Box title="Nuvem de palavras-chave (OpenAlex Concepts)">
                <WordCloud data={keywords} />
              </Box>
            )}

            {/* ── rankings ── */}
            {tab === "rankings" && (
              <>
                <Box title="Top autores (nº de publicações)">
           
