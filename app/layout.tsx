import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata={title:"Simulador de Salário",description:"Dashboard para cálculo de salário, comissão e bonificações."};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="pt-BR"><body>{children}</body></html>}
