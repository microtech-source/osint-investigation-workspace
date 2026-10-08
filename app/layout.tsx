import type { Metadata } from "next";
import "./globals.css";
import { Shell } from "@/components/shell";
export const metadata: Metadata={title:"Fieldnotes | Private OSINT Workspace",description:"Private investigation workspace and OSINT tool catalog"};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body><Shell>{children}</Shell></body></html>}
