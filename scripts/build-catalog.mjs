import fs from 'node:fs';
const source=JSON.parse(fs.readFileSync('tools.json','utf8'));
const tools=source.filter(x=>!x.archived).map(x=>({...x,description:x.description||'',tags:x.tags||[],aliases:x.aliases||[]}));
fs.writeFileSync('data/catalog.json',JSON.stringify(tools));
const categories=[...new Set(tools.map(x=>x.category))].sort();fs.writeFileSync('data/categories.json',JSON.stringify(categories,null,2));
const index=tools.map(x=>({id:x.id,name:x.name,category:x.category,text:[x.name,x.description,x.category,...x.tags,...x.aliases].join(' ').toLowerCase()}));fs.writeFileSync('data/search-index.json',JSON.stringify(index));
console.log(`Indexed ${tools.length} tools in ${categories.length} categories`);
