import type { Metadata } from "next";
import "./globals.css";
export const metadata:Metadata={title:"Simulador de Salário · DANE SE",description:"Simulador de remuneração para Vendedores e Sub Gerentes."};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="pt-BR"><body>{children}</body></html>}
