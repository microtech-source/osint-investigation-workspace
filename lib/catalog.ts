import catalog from "@/data/catalog.json";
export type Tool={id:string;name:string;description:string;category:string;url:string;install?:{method?:string;kali?:string;raw?:string};tags:string[];aliases:string[]};
export const tools=catalog as Tool[];
export const categories=[...new Set(tools.map(t=>t.category))].sort();
export const label=(s:string)=>s.split(/[-_]/).map(x=>x.charAt(0).toUpperCase()+x.slice(1)).join(" ");
