"use client";

import { useEffect, useRef, useState } from "react";
import { parse } from "exifr";
import { Copy, FileImage, Fingerprint, ImagePlus, ScanLine, ShieldCheck } from "lucide-react";

type ImageInfo = { name: string; type: string; size: number; width: number; height: number; sha256: string; metadata: Record<string, unknown> };
const META_FIELDS = ["Make", "Model", "Software", "DateTimeOriginal", "CreateDate", "ModifyDate", "Orientation", "ExposureTime", "FNumber", "ISO", "FocalLength", "LensModel", "Artist", "Copyright", "GPSLatitude", "GPSLongitude", "GPSAltitude"];
const prettySize = (bytes: number) => bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(2)} MB`;

export function ForensicsWorkbench() {
  const [source, setSource] = useState<string>();
  const [ela, setEla] = useState<string>();
  const [info, setInfo] = useState<ImageInfo>();
  const [quality, setQuality] = useState(90);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const histogram = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  useEffect(() => () => { if (source) URL.revokeObjectURL(source); }, [source]);

  async function loadFile(file?: File) {
    setError(""); setEla(undefined); setInfo(undefined);
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp", "image/gif", "image/bmp"].includes(file.type)) {
      setError("Choose a JPEG, PNG, WebP, GIF, or BMP image."); return;
    }
    const url = URL.createObjectURL(file); setSource(url);
    try {
      const [hash, metadata] = await Promise.all([
        crypto.subtle.digest("SHA-256", await file.arrayBuffer()),
        parse(file, { pick: META_FIELDS }),
      ]);
      const sha256 = Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
      const image = new window.Image(); image.src = url; await image.decode();
      setInfo({ name: file.name, type: file.type || "Unknown", size: file.size, width: image.naturalWidth, height: image.naturalHeight, sha256, metadata: (metadata || {}) as Record<string, unknown> });
    } catch (e) { setError(e instanceof Error ? e.message : "Could not read this image."); }
  }

  function analyzeEla() {
    const image = imageRef.current;
    if (!image) return;
    const scale = Math.min(1, 1400 / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const original = document.createElement("canvas"); original.width = width; original.height = height;
    const originalCtx = original.getContext("2d", { willReadFrequently: true });
    const compressedCtx = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
    if (!originalCtx || !compressedCtx) return;
    compressedCtx.canvas.width = width; compressedCtx.canvas.height = height;
    originalCtx.drawImage(image, 0, 0, width, height);
    const pixels = originalCtx.getImageData(0, 0, width, height);
    const recompressed = new window.Image();
    recompressed.onload = () => {
      compressedCtx.drawImage(recompressed, 0, 0, width, height);
      const compare = compressedCtx.getImageData(0, 0, width, height);
      for (let i = 0; i < pixels.data.length; i += 4) {
        pixels.data[i] = Math.min(255, Math.abs(pixels.data[i] - compare.data[i]) * 18);
        pixels.data[i + 1] = Math.min(255, Math.abs(pixels.data[i + 1] - compare.data[i + 1]) * 18);
        pixels.data[i + 2] = Math.min(255, Math.abs(pixels.data[i + 2] - compare.data[i + 2]) * 18);
      }
      originalCtx.putImageData(pixels, 0, 0);
      setEla(original.toDataURL("image/png"));
    };
    recompressed.src = original.toDataURL("image/jpeg", quality / 100);
  }

  function drawHistogram() {
    const image = imageRef.current, canvas = histogram.current;
    if (!image || !canvas) return;
    const width = 720, height = 190, bins = 128;
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true }); if (!ctx) return;
    const sample = document.createElement("canvas"); sample.width = bins * 4; sample.height = bins * 4;
    const sampleCtx = sample.getContext("2d", { willReadFrequently: true }); if (!sampleCtx) return;
    sampleCtx.drawImage(image, 0, 0, sample.width, sample.height);
    const pixels = sampleCtx.getImageData(0, 0, sample.width, sample.height).data;
    const channels = [new Uint32Array(bins), new Uint32Array(bins), new Uint32Array(bins)];
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 3] > 0) { channels[0][pixels[i] >> 1]++; channels[1][pixels[i + 1] >> 1]++; channels[2][pixels[i + 2] >> 1]++; }
    const max = Math.max(1, ...channels.flatMap((c) => Array.from(c)));
    ctx.clearRect(0, 0, width, height);
    const colors = ["rgba(248,113,113,.65)", "rgba(74,222,128,.55)", "rgba(96,165,250,.65)"];
    channels.forEach((channel, index) => {
      ctx.fillStyle = colors[index]; ctx.beginPath(); ctx.moveTo(0, height);
      channel.forEach((count, bin) => ctx.lineTo(bin * (width / bins), height - (count / max) * (height - 8)));
      ctx.lineTo(width, height); ctx.closePath(); ctx.fill();
    });
  }

  useEffect(() => { if (info) drawHistogram(); }, [info]);

  async function copyHash() {
    if (!info) return;
    await navigator.clipboard.writeText(info.sha256); setCopied(true); window.setTimeout(() => setCopied(false), 1500);
  }

  return <main>
    <div className="mb-7"><p className="mb-2 text-xs font-semibold uppercase tracking-[.2em] text-emerald-300">Sherloq web tools</p><h1 className="text-3xl font-semibold tracking-tight">Image forensics</h1><p className="mt-2 max-w-2xl text-sm muted">Inspect image metadata, calculate a file hash, view color-channel distributions, and run a basic error-level analysis.</p></div>
    <div className="mb-5 flex items-start gap-3 rounded-xl border border-emerald-400/20 bg-emerald-400/[.04] p-4 text-sm"><ShieldCheck className="mt-0.5 shrink-0 text-emerald-300" size={18}/><p><span className="font-medium text-emerald-100">Local analysis.</span> Your image stays in this browser. It is not uploaded to the workspace or sent to a server.</p></div>
    <label className="panel motion-card mb-5 flex cursor-pointer flex-col items-center justify-center gap-3 border-dashed p-8 text-center hover:border-emerald-300/40"><ImagePlus className="text-emerald-300" size={28}/><span className="font-medium">Choose an image to inspect</span><span className="text-xs muted">JPEG, PNG, WebP, GIF, or BMP · analyzed on this device</span><input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/bmp" onChange={(e) => void loadFile(e.target.files?.[0])}/></label>
    {error && <p className="mb-5 rounded-lg border border-red-400/20 bg-red-400/5 p-3 text-sm text-red-300">{error}</p>}
    {info && <div className="space-y-5">
      <section className="grid gap-5 xl:grid-cols-[1.15fr_1fr]">
        <div className="panel motion-card overflow-hidden"><div className="border-b border-slate-800 px-5 py-4"><h2 className="flex items-center gap-2 font-semibold"><FileImage size={17} className="text-emerald-300"/>Image preview</h2></div><div className="grid min-h-72 place-items-center bg-[linear-gradient(45deg,#111827_25%,transparent_25%),linear-gradient(-45deg,#111827_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#111827_75%),linear-gradient(-45deg,transparent_75%,#111827_75%)] bg-[length:24px_24px] bg-[position:0_0,0_12px,12px_-12px,-12px_0] p-4"><img ref={imageRef} src={source} alt="Selected image for local analysis" onLoad={drawHistogram} className="max-h-[480px] max-w-full object-contain"/></div><div className="border-t border-slate-800 px-5 py-3 text-xs muted">{info.name} · {info.width} × {info.height} · {prettySize(info.size)} · {info.type}</div></div>
        <div className="panel motion-card p-5"><h2 className="mb-4 flex items-center gap-2 font-semibold"><Fingerprint size={17} className="text-emerald-300"/>File fingerprint</h2><p className="mb-2 text-xs uppercase tracking-wide muted">SHA-256</p><code className="block break-all rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs leading-5 text-slate-300">{info.sha256}</code><button onClick={() => void copyHash()} className="mt-3 flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs hover:border-slate-500"><Copy size={14}/>{copied ? "Copied" : "Copy hash"}</button>
          <h3 className="mb-3 mt-7 text-sm font-semibold">EXIF metadata</h3>{Object.entries(info.metadata).length ? <dl className="grid grid-cols-[minmax(7rem,.7fr)_1.3fr] gap-x-3 gap-y-2 text-xs">{Object.entries(info.metadata).map(([key, value]) => <div key={key} className="contents"><dt className="text-slate-500">{key}</dt><dd className="break-words text-slate-300">{String(value)}</dd></div>)}</dl> : <p className="text-xs muted">No supported EXIF metadata found in this image.</p>}
        </div>
      </section>
      <section className="panel motion-card p-5"><div className="mb-4 flex items-center gap-2"><ScanLine size={17} className="text-emerald-300"/><h2 className="font-semibold">RGB histogram</h2></div><canvas ref={histogram} className="h-auto w-full" aria-label="Red, green, and blue channel histogram"/><div className="mt-3 flex gap-4 text-xs muted"><span className="text-red-300">● Red</span><span className="text-green-300">● Green</span><span className="text-blue-300">● Blue</span></div></section>
      <section className="panel motion-card p-5"><div className="flex flex-wrap items-end justify-between gap-4"><div><h2 className="font-semibold">Error-level analysis</h2><p className="mt-1 text-xs muted">Compares the image with a JPEG recompression. Bright regions show stronger pixel differences and need context.</p></div><div className="flex items-center gap-3"><label className="text-xs muted">JPEG quality: {quality}</label><input type="range" min="50" max="98" value={quality} onChange={(e) => setQuality(Number(e.target.value))} aria-label="JPEG quality"/><button onClick={analyzeEla} className="rounded-lg bg-emerald-300 px-3 py-2 text-xs font-semibold text-slate-950">Run analysis</button></div></div>{ela && <div className="mt-5 grid gap-4 md:grid-cols-2"><div><p className="mb-2 text-xs muted">Original</p><img src={source} alt="Original image" className="max-h-96 w-full rounded-lg bg-slate-950 object-contain"/></div><div><p className="mb-2 text-xs muted">Amplified difference</p><img src={ela} alt="Error-level analysis difference map" className="max-h-96 w-full rounded-lg bg-slate-950 object-contain"/></div></div>}<p className="mt-4 text-[11px] leading-5 text-slate-500">ELA is a visual comparison aid, not proof of manipulation. Results vary with image format, editing history, and compression.</p></section>
    </div>}
  </main>;
}
