"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowDownAZ, ArrowUpRight, Check, ChevronDown, Copy, ExternalLink, Search, SlidersHorizontal, Sparkles, X } from "lucide-react";
import { type Tool, label } from "@/lib/catalog";

type Field = { name: string; value: string; weight: number };
type Query = { terms: string[]; filters: Array<{ field: string; value: string }> };
type SearchResult = { tool: Tool; score: number; fuzzy: boolean };
const PAGE_SIZE = 30;
const OPERATORS = new Set(["name", "category", "tag", "alias", "site", "install", "method", "source", "section"]);

function normalize(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function parseQuery(raw: string): Query {
  const tokens = raw.match(/(?:[\w-]+:(?:"[^"]+"|\S+))|"[^"]+"|\S+/g) || [];
  const terms: string[] = [];
  const filters: Query["filters"] = [];
  for (const token of tokens) {
    const match = token.match(/^([\w-]+):(.+)$/);
    const operator = match?.[1]?.toLowerCase();
    if (match && operator && OPERATORS.has(operator)) {
      filters.push({ field: operator, value: normalize(match[2].replace(/^"|"$/g, "")) });
    } else {
      const term = normalize(token.replace(/^"|"$/g, ""));
      if (term) terms.push(term);
    }
  }
  return { terms, filters };
}

function fieldsFor(tool: Tool): Field[] {
  let host = "";
  try { host = tool.url ? new URL(tool.url).hostname : ""; } catch { /* Keep malformed upstream URLs searchable as raw text. */ }
  return [
    { name: "name", value: tool.name, weight: 120 },
    { name: "alias", value: tool.aliases.join(" "), weight: 95 },
    { name: "category", value: `${tool.category} ${label(tool.category)}`, weight: 82 },
    { name: "tag", value: tool.tags.join(" "), weight: 76 },
    { name: "description", value: tool.description, weight: 55 },
    { name: "site", value: `${tool.url} ${host}`, weight: 50 },
    { name: "install", value: `${tool.install?.kali || ""} ${tool.install?.raw || ""} ${tool.install?.method || ""}`, weight: 44 },
    { name: "section", value: (tool.sections_seen || []).join(" "), weight: 36 },
    { name: "source", value: (tool.source_versions || []).join(" "), weight: 22 },
  ];
}

function editDistance(a: string, b: string, maximum: number) {
  if (Math.abs(a.length - b.length) > maximum) return maximum + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost);
      rowMin = Math.min(rowMin, current[j]);
    }
    if (rowMin > maximum) return maximum + 1;
    previous = current;
  }
  return previous[b.length];
}

function bestTermScore(term: string, fields: Field[]) {
  let best = 0;
  let fuzzy = false;
  for (const field of fields) {
    const value = normalize(field.value);
    if (!value) continue;
    if (value === term) best = Math.max(best, field.weight + 30);
    else if (value.startsWith(term)) best = Math.max(best, field.weight + 20);
    else if (value.includes(term)) best = Math.max(best, field.weight);
    if (term.length < 4 || best >= field.weight) continue;
    for (const token of value.split(/[^\p{L}\p{N}]+/u)) {
      if (token.length < 4) continue;
      const maxDistance = term.length >= 8 ? 2 : 1;
      if (editDistance(term, token, maxDistance) <= maxDistance) {
        best = Math.max(best, Math.round(field.weight * 0.62));
        fuzzy = true;
      }
    }
  }
  return { score: best, fuzzy };
}

function matchesFilter(tool: Tool, field: string, value: string, fields: Field[]) {
  const lookup: Record<string, string[]> = {
    name: [tool.name], category: [tool.category, label(tool.category)], tag: tool.tags,
    alias: tool.aliases, site: [tool.url, ...fields.filter((item) => item.name === "site").map((item) => item.value)],
    install: [tool.install?.kali || "", tool.install?.raw || "", tool.install?.method || ""],
    method: [tool.install?.method || ""], source: tool.source_versions || [], section: tool.sections_seen || [],
  };
  return (lookup[field] || []).some((item) => normalize(item).includes(value));
}

function rankTools(items: Tool[], query: Query, category: string): SearchResult[] {
  return items.flatMap((tool) => {
    if (category !== "all" && tool.category !== category) return [];
    const fields = fieldsFor(tool);
    if (!query.filters.every(({ field, value }) => matchesFilter(tool, field, value, fields))) return [];
    let score = 0;
    let fuzzy = false;
    for (const term of query.terms) {
      const match = bestTermScore(term, fields);
      if (!match.score) return [];
      score += match.score;
      fuzzy ||= match.fuzzy;
    }
    return [{ tool, score, fuzzy }];
  }).sort((a, b) => b.score - a.score || a.tool.name.localeCompare(b.tool.name));
}

function Highlight({ text, terms }: { text: string; terms: string[] }) {
  const literalTerms = [...new Set(terms.filter((term) => term.length > 1 && !term.includes(":")))];
  if (!literalTerms.length) return <>{text}</>;
  const regexCharacters = new Set(["\\", ".", "*", "+", "?", "^", "$", "{", "}", "(", ")", "|", "[", "]"]);
  const escapedTerms = literalTerms.map((term) => [...term].map((character) => regexCharacters.has(character) ? `\\${character}` : character).join(""));
  const pattern = new RegExp(`(${escapedTerms.join("|")})`, "gi");
  return <>{text.split(pattern).map((part, index) => literalTerms.some((term) => normalize(part) === term) ? <mark key={index} className="rounded bg-emerald-300/15 px-0.5 text-emerald-100">{part}</mark> : part)}</>;
}

function relatedTools(tool: Tool, items: Tool[]) {
  const tags = new Set(tool.tags.map(normalize));
  return items.filter((other) => other.id !== tool.id).map((other) => ({
    other,
    score: (other.category === tool.category ? 3 : 0) + other.tags.filter((tag) => tags.has(normalize(tag))).length,
  })).filter((entry) => entry.score > 0).sort((a, b) => b.score - a.score).slice(0, 3).map((entry) => entry.other);
}

export function Directory({ items }: { items: Tool[] }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [sort, setSort] = useState<"relevance" | "name">("relevance");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [focused, setFocused] = useState(false);
  const [suggestion, setSuggestion] = useState(0);
  const [copied, setCopied] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (event.key === "/" && !/INPUT|TEXTAREA|SELECT/.test((event.target as HTMLElement)?.tagName || "")) {
        event.preventDefault(); searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  const categories = useMemo(() => [...new Set(items.map((tool) => tool.category))].sort(), [items]);
  const parsed = useMemo(() => parseQuery(q), [q]);
  const ranked = useMemo(() => rankTools(items, parsed, cat), [items, parsed, cat]);
  const results = useMemo(() => sort === "name" ? [...ranked].sort((a, b) => a.tool.name.localeCompare(b.tool.name)) : ranked, [ranked, sort]);
  const suggestions = useMemo(() => q.trim() ? ranked.slice(0, 5) : [], [q, ranked]);
  const shown = results.slice(0, limit);
  const resultTerms = [...parsed.terms, ...q.match(/"[^"]+"/g)?.map((term) => normalize(term.replaceAll('"', ""))) || []];

  async function copy(text: string, id: string) {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopied(id);
    window.setTimeout(() => setCopied((current) => current === id ? "" : current), 1400);
  }

  function handleSearchKey(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && suggestions.length) { event.preventDefault(); setSuggestion((index) => (index + 1) % suggestions.length); }
    if (event.key === "ArrowUp" && suggestions.length) { event.preventDefault(); setSuggestion((index) => (index - 1 + suggestions.length) % suggestions.length); }
    if (event.key === "Enter" && focused && suggestions[suggestion]) { event.preventDefault(); setQ(suggestions[suggestion].tool.name); setFocused(false); }
    if (event.key === "Escape") { setQ(""); setFocused(false); }
  }

  return <>
    <div className="relative z-20 mb-4">
      <div className="panel flex items-center gap-3 px-4 shadow-[0_16px_55px_rgba(0,0,0,.19)] focus-within:border-emerald-300/40 focus-within:shadow-[0_0_30px_rgba(16,185,129,.08)]">
        <Search size={18} className="shrink-0 text-emerald-300" />
        <input ref={searchRef} data-catalog-search autoFocus role="combobox" aria-autocomplete="list" aria-expanded={focused && suggestions.length > 0} aria-controls="catalog-suggestions" placeholder="Search 753 resources by name, intent, alias, tag, or site…" value={q} onFocus={() => setFocused(true)} onBlur={() => window.setTimeout(() => setFocused(false), 120)} onKeyDown={handleSearchKey} onChange={(event) => { setQ(event.target.value); setSuggestion(0); setLimit(PAGE_SIZE); }} className="w-full bg-transparent py-4 text-sm outline-none placeholder:text-slate-600" />
        {q && <button onClick={() => { setQ(""); setSuggestion(0); searchRef.current?.focus(); }} aria-label="Clear search" className="rounded-md p-1.5 text-slate-500 hover:bg-slate-800 hover:text-white"><X size={15}/></button>}
        <kbd className="shrink-0 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-500">/</kbd>
      </div>
      {focused && suggestions.length > 0 && <div id="catalog-suggestions" role="listbox" className="absolute inset-x-0 top-[calc(100%+8px)] overflow-hidden rounded-xl border border-slate-700 bg-[#0b111b]/[.98] p-2 shadow-2xl backdrop-blur-xl">
        <p className="px-3 py-2 text-[10px] font-semibold uppercase tracking-[.18em] text-slate-500"><Sparkles size={12} className="mr-1 inline text-emerald-300"/>Top matches · Enter to select</p>
        {suggestions.map(({ tool }, index) => <button key={tool.id} role="option" aria-selected={suggestion === index} onMouseDown={(event) => event.preventDefault()} onClick={() => { setQ(tool.name); setFocused(false); }} className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left ${index === suggestion ? "bg-emerald-300/10 text-white" : "text-slate-300 hover:bg-slate-800"}`}><span className="truncate text-sm">{tool.name}</span><span className="ml-4 shrink-0 text-[10px] text-slate-500">{label(tool.category)}</span></button>)}
      </div>}
    </div>
    <p className="mb-5 text-xs leading-5 text-slate-500">Search descriptions, aliases, URLs, tags, installation methods, original sections, and source versions. Try <code className="text-slate-400">tag:username</code>, <code className="text-slate-400">category:geolocation</code>, <code className="text-slate-400">method:docker</code>, or combine terms. Typo-tolerant matching is enabled.</p>

    <div className="mb-5 flex flex-col gap-3 rounded-xl border border-slate-800/80 bg-slate-950/30 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2 text-xs text-slate-400"><SlidersHorizontal size={14} className="text-emerald-300"/>Filter by category</div>
      <div className="flex flex-wrap gap-1.5">
        <button onClick={() => { setCat("all"); setLimit(PAGE_SIZE); }} className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${cat === "all" ? "border-emerald-300/40 bg-emerald-300/10 text-emerald-100" : "border-slate-800 text-slate-500 hover:border-slate-600 hover:text-slate-300"}`}>All <span className="ml-1 opacity-60">{items.length}</span></button>
        {categories.map((category) => <button key={category} onClick={() => { setCat(category); setLimit(PAGE_SIZE); }} className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${cat === category ? "border-emerald-300/40 bg-emerald-300/10 text-emerald-100" : "border-slate-800 text-slate-500 hover:border-slate-600 hover:text-slate-300"}`}>{label(category)}</button>)}
      </div>
    </div>

    <div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-xs">
      <p className="text-slate-400"><span className="font-semibold text-white">{results.length.toLocaleString()}</span> of {items.length.toLocaleString()} resources{cat !== "all" ? <> in <span className="text-emerald-200">{label(cat)}</span></> : null}{parsed.filters.length > 0 ? <span className="ml-1 text-slate-500">· {parsed.filters.length} advanced {parsed.filters.length === 1 ? "filter" : "filters"}</span> : null}</p>
      <button onClick={() => setSort((current) => current === "relevance" ? "name" : "relevance")} className="flex items-center gap-1.5 rounded-md border border-slate-800 px-2.5 py-1.5 text-slate-400 hover:border-slate-600 hover:text-white">{sort === "relevance" ? <Sparkles size={13}/> : <ArrowDownAZ size={13}/>}Sort: {sort === "relevance" ? "relevance" : "name"}<ChevronDown size={12}/></button>
    </div>

    {shown.length ? <div className="grid gap-3 lg:grid-cols-2">{shown.map(({ tool, fuzzy }, index) => {
      const officialHost = (() => { try { return tool.url ? new URL(tool.url).hostname : ""; } catch { return ""; } })();
      const copyText = tool.install?.kali?.trim() || tool.url || tool.install?.raw || "";
      const similar = relatedTools(tool, items);
      return <article key={tool.id} style={{ animationDelay: `${Math.min(index % PAGE_SIZE, 12) * 24}ms` }} className="panel motion-card group p-4 sm:p-5">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold tracking-wide text-slate-100"><Highlight text={tool.name} terms={resultTerms}/></h3>{fuzzy && <span className="rounded-full border border-indigo-300/20 bg-indigo-300/[.06] px-2 py-0.5 text-[9px] uppercase tracking-wider text-indigo-200">Fuzzy match</span>}</div><p className="mt-1.5 text-xs leading-5 text-slate-400"><Highlight text={tool.description} terms={resultTerms}/></p></div>
          {tool.url && <a href={tool.url} target="_blank" rel="noopener noreferrer" aria-label={`Open official resource for ${tool.name}`} title={officialHost} className="shrink-0 rounded-lg border border-slate-800 p-2 text-slate-500 hover:border-emerald-300/30 hover:text-emerald-200"><ExternalLink size={15}/></a>}
        </div>
        <div className="mb-3 flex flex-wrap items-center gap-1.5"><Link href={`/categories/${tool.category}`} className="rounded-md border border-slate-700/80 bg-slate-800/50 px-2 py-1 text-[10px] text-slate-300 hover:border-emerald-300/30"><Highlight text={label(tool.category)} terms={resultTerms}/></Link>{tool.install?.method && <span className="rounded-md border border-slate-800 px-2 py-1 text-[10px] uppercase tracking-wide text-slate-500">{tool.install.method}</span>}{officialHost && <span className="max-w-full truncate rounded-md border border-slate-800 px-2 py-1 text-[10px] text-slate-500">{officialHost}</span>}</div>
        {tool.tags.length > 0 && <div className="mb-3 flex flex-wrap gap-1.5">{tool.tags.slice(0, 6).map((tag) => <span key={tag} className="rounded-full bg-slate-800/70 px-2 py-1 text-[10px] text-slate-400"><Highlight text={tag} terms={resultTerms}/></span>)}{tool.tags.length > 6 && <span className="px-1 py-1 text-[10px] text-slate-600">+{tool.tags.length - 6} tags</span>}</div>}
        <details className="group/details border-t border-slate-800/80 pt-3">
          <summary className="flex cursor-pointer list-none items-center justify-between text-[11px] text-slate-500 hover:text-emerald-200"><span>More intelligence · aliases, source, installation, related</span><ChevronDown size={14} className="transition-transform group-open/details:rotate-180"/></summary>
          <div className="mt-3 space-y-3 text-xs">
            {tool.aliases.length > 0 && <div><p className="mb-1 text-[10px] uppercase tracking-wider text-slate-600">Known as</p><div className="flex flex-wrap gap-1.5">{tool.aliases.map((alias) => <span key={alias} className="rounded bg-slate-900 px-2 py-1 text-slate-400"><Highlight text={alias} terms={resultTerms}/></span>)}</div></div>}
            {tool.sections_seen && tool.sections_seen.length > 0 && <div><p className="mb-1 text-[10px] uppercase tracking-wider text-slate-600">Source sections</p><p className="text-slate-400">{tool.sections_seen.join(" · ")}</p></div>}
            {tool.source_versions && tool.source_versions.length > 0 && <div><p className="mb-1 text-[10px] uppercase tracking-wider text-slate-600">Catalog provenance</p><p className="text-slate-400">{tool.source_versions.join(" · ")}{tool.archived ? " · archived upstream" : ""}</p></div>}
            {tool.url && <div><p className="mb-1 text-[10px] uppercase tracking-wider text-slate-600">Official resource URL</p><a href={tool.url} target="_blank" rel="noopener noreferrer" className="break-all text-emerald-200 hover:underline">{tool.url}<ArrowUpRight size={12} className="ml-1 inline"/></a></div>}
            {copyText && <div><p className="mb-1 text-[10px] uppercase tracking-wider text-slate-600">{tool.install?.kali ? "Installation / resource command" : "Quick access"}</p><div className="flex items-start gap-2"><code className="min-w-0 flex-1 overflow-x-auto rounded-md border border-slate-800 bg-slate-950 px-2.5 py-2 text-[11px] text-slate-300">{copyText}</code><button onClick={() => void copy(copyText, tool.id)} aria-label={`Copy command or URL for ${tool.name}`} className="shrink-0 rounded-md border border-slate-800 p-2 text-slate-400 hover:border-emerald-300/30 hover:text-emerald-200">{copied === tool.id ? <Check size={14}/> : <Copy size={14}/>}</button></div></div>}
            {similar.length > 0 && <div><p className="mb-1.5 text-[10px] uppercase tracking-wider text-slate-600">Related resources</p><div className="flex flex-wrap gap-1.5">{similar.map((related) => <button key={related.id} onClick={() => { setQ(related.name); setCat("all"); setLimit(PAGE_SIZE); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="rounded-full border border-slate-800 px-2 py-1 text-[10px] text-slate-400 hover:border-emerald-300/30 hover:text-emerald-100">{related.name}</button>)}</div></div>}
          </div>
        </details>
      </article>;
    })}</div> : <div className="panel motion-card p-10 text-center"><Search className="mx-auto mb-3 text-slate-600" size={22}/><p className="text-sm text-slate-300">No resources match that search.</p><p className="mt-2 text-xs text-slate-500">Try fewer words, remove a filter, or search a category such as <button className="text-emerald-200 hover:underline" onClick={() => { setQ("category:people"); setCat("all"); }}>people and identity</button>.</p></div>}
    {results.length > shown.length && <div className="mt-5 flex justify-center"><button onClick={() => setLimit((current) => current + PAGE_SIZE)} className="rounded-lg border border-slate-700 bg-slate-900/50 px-4 py-2.5 text-xs text-slate-300 hover:border-emerald-300/30 hover:text-white">Load more · {Math.min(PAGE_SIZE, results.length - shown.length)} of {results.length - shown.length} remaining</button></div>}
    {results.length > 0 && <p className="mt-4 text-center text-[10px] text-slate-600">Ranked across {items.length} catalog entries · exact matches rank above fuzzy matches · open a result for source and installation details</p>}
  </>;
}
