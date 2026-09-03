"use client";

import { useMemo, useState } from "react";

const API="https://svoeylrqgqbwfioezdhk.supabase.co/functions/v1/salary-dashboard";
const storePasswords:Record<string,{slug:string,password:string}>={
  "flagship":{slug:"flagship",password:"Flagship"},
  "brasilia shopping":{slug:"brasilia-shopping",password:"Brasília Shopping"},
  "lago sul":{slug:"lago-sul",password:"Lago Sul"},
  "mane":{slug:"mane",password:"Mané"},
  "parkshopping":{slug:"parkshopping",password:"ParkShopping"}
};
const normalize=(v:string)=>v.normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().toLowerCase();
const money=new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"});
const percent=new Intl.NumberFormat("pt-BR",{style:"percent",minimumFractionDigits:2,maximumFractionDigits:2});

type Role="seller"|"sub"|null;
type Store={id:string;slug:string;name:string;floor_value:number;goal_value:number;base_salary:number;active?:boolean};
type Rule={id?:string;store_id:string;section:"eligibility"|"accelerator"|"bonus"|"summary";label:string;input_type:"yes_no"|"number"|"automatic";operation:"add"|"subtract"|"none";amount:number;sort_order:number;active:boolean};

async function call(body:Record<string,unknown>){
  const r=await fetch(API,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  const data=await r.json();
  if(!r.ok)throw new Error(data.error||"Erro de conexão");
  return data;
}
function Num({value,onChange}:{value:number;onChange:(n:number)=>void}){
  return <div className="number-field"><span>R$</span><input type="number" value={value||""} onChange={e=>onChange(Number(e.target.value)||0)}/></div>;
}
function Toggle({value,onChange}:{value:boolean;onChange:(v:boolean)=>void}){
  return <button type="button" className={"toggle "+(value?"yes":"no")} onClick={()=>onChange(!value)}><span>{value?"Sim":"Não"}</span><i/></button>;
}
function YesNo({value,onChange}:{value:boolean;onChange:(v:boolean)=>void}){
  return <select className="orange-select" value={value?"Sim":"Não"} onChange={e=>onChange(e.target.value==="Sim")}><option>Sim</option><option>Não</option></select>;
}
function ruleValue(r:Rule,answer:boolean|number|undefined){
  return r.input_type==="yes_no"?(answer?r.amount:0):r.input_type==="number"?(Number(answer)||0)*r.amount:r.amount;
}

const eligibilityLabels=[
  "Sem falta injustificada","Máximo de 3 atrasos no mês","Pontos no horário correto","Sem advertência no ciclo",
  "Atingimento de 90% do PISO","95% das vendas com cadastro completo no CRM","100% dos carrinhos enviados",
  'Zero "não-conformidade" de uniforme registrada no ciclo'
];
const salesBonusLabels=[
  "Ticket Médio > Meta?","PA > Meta?","Vendas à Vista > X% Vendas Totais?","Vendas Whatsapp > X% Vendas Totais?",
  "Atingiu nota superior a X no relatório da Gerência?","Atingiu os indicadores de CRM?"
];
const subBonusLabels=[
  "Ticket Médio > Meta E Todos os vendedores com TM > 90% Meta?",
  "PA > Meta E Todos os vendedores com PA > 90% Meta?",
  "Vendas à Vista > X% Vendas Totais?","Vendas Whatsapp > X% Vendas Totais?"
];

export default function Home(){
  const [role,setRole]=useState<Role>(null);
  const [password,setPassword]=useState(""),[error,setError]=useState(""),[loading,setLoading]=useState(false);

  // Vendedores: fluxo original preservado
  const [store,setStore]=useState<Store|null>(null),[rules,setRules]=useState<Rule[]>([]),[answers,setAnswers]=useState<Record<string,boolean|number>>({});
  const [revenue,setRevenue]=useState(0),[withdrawals,setWithdrawals]=useState(0),[advances,setAdvances]=useState(0);
  const [adminPassword,setAdminPassword]=useState(""),[adminStores,setAdminStores]=useState<Store[]>([]),[adminStore,setAdminStore]=useState<Store|null>(null),[adminRules,setAdminRules]=useState<Rule[]>([]);

  // Sub Gerentes: valores da planilha aprovada
  const [subLogged,setSubLogged]=useState(false);
  const [vFloor,setVFloor]=useState(40000),[vGoal,setVGoal]=useState(50000),[vRevenue,setVRevenue]=useState(52000);
  const [sFloor,setSFloor]=useState(120000),[sGoal,setSGoal]=useState(150000),[sRevenue,setSRevenue]=useState(160000);
  const [baseSalary,setBaseSalary]=useState(2200),[subWithdrawals,setSubWithdrawals]=useState(0),[subAdvances,setSubAdvances]=useState(0);
  const [eligibility,setEligibility]=useState<boolean[]>(Array(8).fill(true));
  const [eligibleOverride,setEligibleOverride]=useState<boolean|null>(null);
  const [aPiso,setAPiso]=useState<boolean|null>(null),[a10,setA10]=useState<boolean|null>(null),[a20,setA20]=useState<boolean|null>(null),[aMeta,setAMeta]=useState<boolean|null>(null),[salesBlocks,setSalesBlocks]=useState<number|null>(null);
  const [bonus61,setBonus61]=useState<boolean|null>(null),[salesWeeks,setSalesWeeks]=useState(1),[salesBonus,setSalesBonus]=useState<boolean[]>(Array(6).fill(true));
  const [subPiso,setSubPiso]=useState<boolean|null>(null),[subPisoBlocks,setSubPisoBlocks]=useState<number|null>(null),[subMetaBlocks,setSubMetaBlocks]=useState<number|null>(null);
  const [allSellers,setAllSellers]=useState(""),[storeWeeks,setStoreWeeks]=useState(1),[subBonus,setSubBonus]=useState<boolean[]>(Array(4).fill(true)),[checklist,setChecklist]=useState(100);

  const selectAdminStore=async(s:Store,p=adminPassword)=>{setAdminStore({...s});const d=await call({action:"admin_rules",adminPassword:p,store_id:s.id});setAdminRules(d.rules)};
  const enterAdmin=async(p:string)=>{const d=await call({action:"admin_list",adminPassword:p});setAdminPassword(p);setAdminStores(d.stores);if(d.stores[0])await selectAdminStore(d.stores[0],p)};
  const enter=async()=>{
    setLoading(true);setError("");
    try{
      if(normalize(password)==="administrador"){await enterAdmin(password);return;}
      if(role==="seller"){
        const target=storePasswords[normalize(password)];
        if(!target)throw new Error("Senha incorreta");
        const d=await call({action:"store_login",slug:target.slug,password:target.password});
        setStore(d.store);setRules(d.rules);
        const initial:Record<string,boolean|number>={};d.rules.forEach((r:Rule)=>initial[r.id!]=r.input_type==="yes_no");setAnswers(initial);
      }else if(role==="sub"){
        const target=storePasswords[normalize(password)];
        if(!target)throw new Error("Senha incorreta");
        setSubLogged(true);
      }
    }catch(e){setError(e instanceof Error?e.message:"Erro")}finally{setLoading(false)}
  };

  const saveStore=async()=>{if(!adminStore)return;setLoading(true);try{const d=await call({action:"admin_store",adminPassword,id:adminStore.id,name:adminStore.name,floor_value:adminStore.floor_value,goal_value:adminStore.goal_value,base_salary:adminStore.base_salary});setAdminStores(x=>x.map(s=>s.id===d.store.id?d.store:s));alert("Configuração salva para a loja.")}finally{setLoading(false)}};
  const saveRule=async(r:Rule)=>{const d=await call({action:"admin_rule_upsert",adminPassword,rule:r});setAdminRules(x=>r.id?x.map(a=>a.id===r.id?d.rule:a):[...x,d.rule])};
  const deleteRule=async(id?:string)=>{if(!id||!confirm("Excluir esta pergunta?"))return;await call({action:"admin_rule_delete",adminPassword,id});setAdminRules(x=>x.filter(r=>r.id!==id))};
  const addRule=()=>{if(!adminStore)return;setAdminRules(x=>[...x,{store_id:adminStore.id,section:"bonus",label:"Nova pergunta",input_type:"yes_no",operation:"add",amount:0,sort_order:x.length*10+10,active:true}])};

  const sellerCalc=useMemo(()=>{if(!store)return null;const eligibilityRules=rules.filter(r=>r.section==="eligibility"&&r.active);const eligible=eligibilityRules.every(r=>r.input_type!=="yes_no"||answers[r.id!]===true);let additions=0,subtractions=0;for(const r of rules.filter(r=>r.section!=="eligibility"&&r.active)){const value=ruleValue(r,answers[r.id!]);if(r.operation==="add")additions+=value;if(r.operation==="subtract")subtractions+=value}const commission=revenue*.015,dsr=commission/5,total=commission+store.base_salary+(eligible?additions-subtractions:0)+dsr-withdrawals-advances;return{eligible,commission,dsr,additions,subtractions,total}},[store,rules,answers,revenue,withdrawals,advances]);

  const subCalc=useMemo(()=>{
    const floorPct=vFloor>0?vRevenue/vFloor-1:0,goalPct=vGoal>0?vRevenue/vGoal-1:0,storeFloorPct=sFloor>0?sRevenue/sFloor-1:0,storeGoalPct=sGoal>0?sRevenue/sGoal-1:0;
    const eligibleAuto=eligibility.every(Boolean),eligible=eligibleOverride??eligibleAuto;
    const piso=aPiso??floorPct>0,ten=a10??floorPct>.10,twenty=a20??floorPct>.20,meta=aMeta??goalPct>0;
    const blocks=salesBlocks??Math.max(0,Math.floor(goalPct/.05));
    const c26=piso?100:0,c27=ten?100:0,c28=twenty?100:0,c29=meta?vRevenue*.005:0,c30=blocks*vRevenue*.005;
    const salesAccel=eligible?c26+c27+c28+c29+c30:0;
    const b61=bonus61??goalPct>0;
    const salesBonusValues:number[]=salesBonus.map(v=>v?50:0);
    const salesBonusTotal=eligible?(salesWeeks*50+salesBonusValues.reduce((a:number,b:number)=>a+b,0)):0;
    const subPisoAuto=storeFloorPct>0,subPisoValue=subPiso??subPisoAuto;
    const pisoBlocks=subPisoBlocks??Math.max(0,Math.floor(storeFloorPct/.10));
    const metaBlocks=subMetaBlocks??Math.max(0,Math.floor(storeGoalPct/.05));
    const g26=subPisoValue?sRevenue*.0025:0,g27=pisoBlocks*sRevenue*.0005,g28=metaBlocks*sRevenue*.0005;
    const subAccel=g26+g27+g28;
    const g34=allSellers==="Todos!"?100:allSellers==="Exceto 1!"?50:0,g35=storeWeeks*75;
    const subBonusValues:number[]=subBonus.map(v=>v?100:0);
    const g40=checklist<80?0:150+2.5*(checklist-80);
    const subBonusTotal=g34+g35+subBonusValues.reduce((a:number,b:number)=>a+b,0)+g40;
    const commission=vRevenue*.015,dsr=commission/5,total=commission+salesAccel+subAccel+salesBonusTotal+subBonusTotal+baseSalary+dsr-subWithdrawals-subAdvances;
    return{floorPct,goalPct,storeFloorPct,storeGoalPct,eligible,piso,ten,twenty,meta,blocks,c26,c27,c28,c29,c30,salesAccel,b61,salesBonusValues,salesBonusTotal,subPisoValue,pisoBlocks,metaBlocks,g26,g27,g28,subAccel,g34,g35,subBonusValues,g40,subBonusTotal,commission,dsr,total};
  },[vFloor,vGoal,vRevenue,sFloor,sGoal,sRevenue,baseSalary,subWithdrawals,subAdvances,eligibility,eligibleOverride,aPiso,a10,a20,aMeta,salesBlocks,bonus61,salesWeeks,salesBonus,subPiso,subPisoBlocks,subMetaBlocks,allSellers,storeWeeks,subBonus,checklist]);

  const resetAll=()=>location.reload();

  if(adminPassword)return <main><header className="hero"><div><p className="eyebrow">Área exclusiva</p><h1>Administração das lojas</h1><p>Selecione uma loja, altere valores e personalize perguntas.</p></div><button className="admin-button" onClick={resetAll}>Sair</button></header><section className="admin-workspace"><aside><h3>Lojas</h3>{adminStores.map(s=><button key={s.id} className={adminStore?.id===s.id?"selected":""} onClick={()=>selectAdminStore(s)}>{s.name}</button>)}</aside>{adminStore&&<div className="admin-content"><section className="panel"><div className="panel-title"><div><p>Configuração</p><h2>{adminStore.name}</h2></div></div><div className="admin-grid"><label>Nome da loja<input value={adminStore.name} onChange={e=>setAdminStore({...adminStore,name:e.target.value})}/></label><label>Valor do piso<Num value={Number(adminStore.floor_value)} onChange={v=>setAdminStore({...adminStore,floor_value:v})}/></label><label>Valor da meta<Num value={Number(adminStore.goal_value)} onChange={v=>setAdminStore({...adminStore,goal_value:v})}/></label><label>Salário-base<Num value={Number(adminStore.base_salary)} onChange={v=>setAdminStore({...adminStore,base_salary:v})}/></label></div><button className="save-button" onClick={saveStore} disabled={loading}>Salvar configuração</button></section><section className="panel rule-editor"><div className="panel-title"><div><p>Personalização</p><h2>Perguntas e valores</h2></div><button className="save-button" onClick={addRule}>+ Nova pergunta</button></div>{adminRules.map((r,i)=><div className="rule-row" key={r.id||"new"+i}><input value={r.label} onChange={e=>setAdminRules(x=>x.map((a,j)=>j===i?{...a,label:e.target.value}:a))}/><select value={r.section} onChange={e=>setAdminRules(x=>x.map((a,j)=>j===i?{...a,section:e.target.value as Rule["section"]}:a))}><option value="eligibility">Elegibilidade</option><option value="accelerator">Acelerador</option><option value="bonus">Bonificações</option><option value="summary">Resumo</option></select><select value={r.input_type} onChange={e=>setAdminRules(x=>x.map((a,j)=>j===i?{...a,input_type:e.target.value as Rule["input_type"]}:a))}><option value="yes_no">Sim/Não</option><option value="number">Número</option><option value="automatic">Automático</option></select><select value={r.operation} onChange={e=>setAdminRules(x=>x.map((a,j)=>j===i?{...a,operation:e.target.value as Rule["operation"]}:a))}><option value="add">Somar</option><option value="subtract">Descontar</option><option value="none">Não calcular</option></select><input type="number" value={r.amount} onChange={e=>setAdminRules(x=>x.map((a,j)=>j===i?{...a,amount:Number(e.target.value)}:a))}/><button onClick={()=>saveRule(r)}>Salvar</button><button className="danger" onClick={()=>deleteRule(r.id)}>Excluir</button></div>)}</section></div>}</section></main>;

  if(!role)return <main className="choice-page"><section className="choice-card"><div className="danese-brand"><span>DANE</span><b>SE</b></div><p className="eyebrow">Simulador de remuneração</p><h1>Como você quer acessar?</h1><p>Escolha seu perfil para acessar o simulador de salário.</p><div className="choice-buttons"><button className="role-button primary" onClick={()=>{setRole("seller");setPassword("");setError("")}}><strong>VENDEDORES</strong></button><button className="role-button" onClick={()=>{setRole("sub");setPassword("");setError("")}}><strong>SUB GERENTES</strong></button></div></section></main>;

  if(role==="seller"&&!store)return <main className="login-page"><section className="login-card"><button className="back-link" onClick={()=>setRole(null)}>← Voltar</button><p className="eyebrow">Vendedores · acesso por loja</p><h1>Simulador de salário</h1><p>Digite a senha da sua loja.</p><label>Senha<input type="password" value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>e.key==="Enter"&&enter()} autoFocus/></label>{error&&<div className="login-error">{error}</div>}<button onClick={enter} disabled={loading}>{loading?"Entrando...":"Entrar no dashboard"}</button></section></main>;

  if(role==="sub"&&!subLogged)return <main className="login-page"><section className="login-card"><button className="back-link" onClick={()=>setRole(null)}>← Voltar</button><p className="eyebrow">Sub Gerentes · acesso restrito</p><h1>Simulador de salário</h1><p>Digite a senha da sua loja ou a senha de administrador.</p><label>Senha<input type="password" value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>e.key==="Enter"&&enter()} autoFocus/></label>{error&&<div className="login-error">{error}</div>}<button onClick={enter} disabled={loading}>{loading?"Entrando...":"Entrar no dashboard"}</button></section></main>;

  if(role==="seller"&&store){
    const section=(name:Rule["section"],title:string)=>{const sectionRules=rules.filter(r=>r.section===name&&r.active);if(!sectionRules.length)return null;const subtotal=sectionRules.reduce((sum,r)=>{if(r.operation==="none")return sum;const value=ruleValue(r,answers[r.id!]);return sum+(r.operation==="subtract"?-value:value)},0);const yesCount=sectionRules.filter(r=>r.input_type==="yes_no"&&Boolean(answers[r.id!])).length;return <section className="panel"><div className="panel-title"><div><h2>{title}</h2></div><span>{name==="eligibility"?`${yesCount} de ${sectionRules.length} em Sim`:`Subtotal: ${money.format(subtotal)}`}</span></div><div className="rows">{sectionRules.map(r=><div className="row" key={r.id}><span>{r.label}{r.operation!=="none"&&r.amount>0?<small> · {r.operation==="subtract"?"-":"+"}{money.format(r.amount)}{r.input_type==="number"?" por unidade":""}</small>:null}</span>{r.input_type==="yes_no"?<Toggle value={Boolean(answers[r.id!])} onChange={v=>setAnswers({...answers,[r.id!]:v})}/>:r.input_type==="number"?<input className="orange-number" type="number" min="0" step="1" value={Number(answers[r.id!])||""} aria-label={r.label} onChange={e=>setAnswers({...answers,[r.id!]:Math.max(0,Math.floor(Number(e.target.value)||0))})}/>:<strong>{money.format(r.amount)}</strong>}</div>)}</div></section>};
    return <main><header className="hero"><div><p className="eyebrow">{store.name} · Painel de remuneração</p><h1>Simulador de salário</h1><p><strong>Preencha APENAS os indicadores em laranja claro.</strong> Os demais são calculados automaticamente.</p></div><div className={"status "+(sellerCalc?.eligible?"approved":"blocked")}><small>Elegibilidade</small><strong>{sellerCalc?.eligible?"Aprovada":"Bloqueada"}</strong></div></header><section className="kpis"><article><span>Faturamento</span><strong>{money.format(revenue)}</strong></article><article><span>Comissão</span><strong>{money.format(sellerCalc?.commission||0)}</strong></article><article><span>Bônus e ajustes</span><strong>{money.format((sellerCalc?.additions||0)-(sellerCalc?.subtractions||0))}</strong></article><article className="total-card"><span>Total aproximado</span><strong>{money.format(sellerCalc?.total||0)}</strong></article></section><div className="dashboard-grid">{section("eligibility","Gatilhos de elegibilidade")}<section className="panel"><div className="panel-title"><div><p>Valores editáveis e cálculos automáticos</p><h2>Piso, meta, faturamento e salário-base</h2></div></div><div className="values-table"><div className="values-head"><span>Indicador</span><span>Valor</span></div><div className="value-row"><span>90% do Piso</span><strong>{money.format(store.floor_value*.9)}</strong></div><label className="value-row editable"><span>Valor do Piso</span><Num value={store.floor_value} onChange={v=>setStore({...store,floor_value:v})}/></label><label className="value-row editable"><span>Valor da Meta</span><Num value={store.goal_value} onChange={v=>setStore({...store,goal_value:v})}/></label><label className="value-row editable"><span>Faturamento Atingido</span><Num value={revenue} onChange={setRevenue}/></label><label className="value-row editable"><span>Salário-base</span><Num value={store.base_salary} onChange={v=>setStore({...store,base_salary:v})}/></label><div className="value-row"><span>% do Piso Atingido</span><strong>{percent.format(store.floor_value>0?revenue/store.floor_value-1:0)}</strong></div><div className="value-row"><span>% da Meta Atingido</span><strong>{percent.format(store.goal_value>0?revenue/store.goal_value-1:0)}</strong></div></div></section>{section("accelerator","Acelerador do bônus")}{section("bonus","Demais bonificações")}{section("summary","Outros valores")}<section className="panel summary"><div className="panel-title"><div><p>Resultado</p><h2>Resumo do cálculo</h2></div></div><div className="summary-rows"><div><span>(+) Comissão</span><strong>{money.format(sellerCalc?.commission||0)}</strong></div><div><span>(+) Bônus e adicionais</span><strong>{money.format(sellerCalc?.additions||0)}</strong></div><div><span>(-) Descontos das regras</span><strong>{money.format(sellerCalc?.subtractions||0)}</strong></div><div><span>(+) Salário-base</span><strong>{money.format(store.base_salary)}</strong></div><div><span>(+) DSR comissão</span><strong>{money.format(sellerCalc?.dsr||0)}</strong></div></div><div className="deductions"><label>Retiradas<Num value={withdrawals} onChange={setWithdrawals}/></label><label>Adiantamentos<Num value={advances} onChange={setAdvances}/></label></div><div className="grand-total"><span>Total aproximado<small>*não são considerados impostos no cálculo acima</small></span><strong>{money.format(sellerCalc?.total||0)}</strong></div></section></div><footer><button className="logout" onClick={resetAll}>Sair da loja</button></footer></main>;
  }

  // SUB GERENTE
  return <main><header className="hero"><div><p className="eyebrow">Sub Gerente · Painel de remuneração</p><h1>Simulador de salário</h1><p><strong>Preencha apenas os indicadores editáveis.</strong> Os demais valores são calculados conforme a planilha de SubGerentes.</p></div><div className={"status "+(subCalc.eligible?"approved":"blocked")}><small>Elegibilidade Vendas</small><strong>{subCalc.eligible?"Aprovada":"Bloqueada"}</strong></div></header>
  <section className="kpis"><article><span>Comissão</span><strong>{money.format(subCalc.commission)}</strong></article><article><span>Aceleradores</span><strong>{money.format(subCalc.salesAccel+subCalc.subAccel)}</strong></article><article><span>Bonificações</span><strong>{money.format(subCalc.salesBonusTotal+subCalc.subBonusTotal)}</strong></article><article className="total-card"><span>Total aproximado</span><strong>{money.format(subCalc.total)}</strong></article></section>
  <div className="dashboard-grid">
    <section className="panel"><div className="panel-title"><div><p>Elegibilidade</p><h2>Gatilhos de elegibilidade</h2></div><span>{eligibility.filter(Boolean).length} de 8 em Sim</span></div><div className="rows">{eligibilityLabels.map((label,i)=><div className="row" key={label}><span>{label}</span><Toggle value={eligibility[i]} onChange={v=>{const x=[...eligibility];x[i]=v;setEligibility(x);setEligibleOverride(null)}}/></div>)}<div className="row"><strong>Está elegível aos bônus?</strong><YesNo value={subCalc.eligible} onChange={setEligibleOverride}/></div></div></section>
    <section className="panel"><div className="panel-title"><div><p>Valores editáveis e cálculos automáticos</p><h2>Vendas</h2></div></div><div className="values-table"><div className="values-head"><span>Indicador</span><span>Valor</span></div><div className="value-row"><span>90% do Piso</span><strong>{money.format(vFloor*.9)}</strong></div><label className="value-row editable"><span>Valor do Piso</span><Num value={vFloor} onChange={setVFloor}/></label><label className="value-row editable"><span>Valor da Meta</span><Num value={vGoal} onChange={setVGoal}/></label><label className="value-row editable"><span>Faturamento Atingido</span><Num value={vRevenue} onChange={setVRevenue}/></label><div className="value-row"><span>% do Piso Atingido</span><strong>{percent.format(subCalc.floorPct)}</strong></div><div className="value-row"><span>% da Meta Atingido</span><strong>{percent.format(subCalc.goalPct)}</strong></div></div></section>
    <section className="panel"><div className="panel-title"><div><p>Acelerador</p><h2>Acelerador do bônus — Vendas</h2></div><span>Subtotal: {money.format(subCalc.salesAccel)}</span></div><div className="sub-table-head"><span>Indicador</span><span>Situação</span><span>Valor</span></div>{[["Bateu o PISO? (R$100,00)",subCalc.piso,aPiso,setAPiso,subCalc.c26],["Bateu 10% do PISO? (R$100,00)",subCalc.ten,a10,setA10,subCalc.c27],["Bateu 20% do PISO? (R$100,00)",subCalc.twenty,a20,setA20,subCalc.c28],["Bateu a META? (0,5% do Faturamento)",subCalc.meta,aMeta,setAMeta,subCalc.c29]].map((r,i)=><div className="sub-table-row" key={i}><span>{r[0] as string}</span><YesNo value={r[1] as boolean} onChange={r[3] as (v:boolean)=>void}/><strong>{money.format(r[4] as number)}</strong></div>)}<div className="sub-table-row"><span>Quantos blocos de 5 p.p. passou da META? (0,5% do fat. a cada 5 p.p.)</span><input className="orange-number" type="number" min="0" step="1" value={subCalc.blocks} onChange={e=>setSalesBlocks(Math.max(0,Math.floor(Number(e.target.value)||0)))}/><strong>{money.format(subCalc.c30)}</strong></div></section>
    <section className="panel"><div className="panel-title"><div><p>Bonificações</p><h2>Demais bonificações — Vendas</h2></div><span>Subtotal: {money.format(subCalc.salesBonusTotal)}</span></div><div className="sub-table-head"><span>Bonificação</span><span>Indicador</span><span>Valor</span></div><div className="sub-table-row"><span>Bônus 61 - Atingiu a Meta?</span><YesNo value={subCalc.b61} onChange={setBonus61}/><strong>{subCalc.b61?"Ganhou!":"Não ganhou"}</strong></div><div className="sub-table-row"><span>Quantas semanas atingiu a meta semanal?</span><input className="orange-number" type="number" min="0" step="1" value={salesWeeks} onChange={e=>setSalesWeeks(Math.max(0,Math.floor(Number(e.target.value)||0)))}/><strong>{money.format(salesWeeks*50)}</strong></div>{salesBonusLabels.map((label,i)=><div className="sub-table-row" key={label}><span>{label}</span><Toggle value={salesBonus[i]} onChange={v=>{const x=[...salesBonus];x[i]=v;setSalesBonus(x)}}/><strong>{money.format(subCalc.salesBonusValues[i])}</strong></div>)}</section>
    <section className="panel"><div className="panel-title"><div><p>Valores editáveis e cálculos automáticos</p><h2>Loja</h2></div></div><div className="values-table"><div className="values-head"><span>Indicador</span><span>Valor</span></div><div className="value-row"><span>90% do Piso</span><strong>{money.format(sFloor*.9)}</strong></div><label className="value-row editable"><span>Valor do Piso</span><Num value={sFloor} onChange={setSFloor}/></label><label className="value-row editable"><span>Valor da Meta</span><Num value={sGoal} onChange={setSGoal}/></label><label className="value-row editable"><span>Faturamento Atingido</span><Num value={sRevenue} onChange={setSRevenue}/></label><div className="value-row"><span>% do Piso Atingido</span><strong>{percent.format(subCalc.storeFloorPct)}</strong></div><div className="value-row"><span>% da Meta Atingido</span><strong>{percent.format(subCalc.storeGoalPct)}</strong></div></div></section>
    <section className="panel"><div className="panel-title"><div><p>Acelerador</p><h2>Acelerador do bônus — SubGerência</h2></div><span>Subtotal: {money.format(subCalc.subAccel)}</span></div><div className="sub-table-head"><span>Indicador</span><span>Situação</span><span>Valor</span></div><div className="sub-table-row"><span>Bateu o PISO? (0,25% sobre faturamento loja)</span><YesNo value={subCalc.subPisoValue} onChange={setSubPiso}/><strong>{money.format(subCalc.g26)}</strong></div><div className="sub-table-row"><span>Quantos blocos de 10 p.p. passou da PISO? (0,05% do fat. a cada 10 p.p.)</span><input className="orange-number" type="number" min="0" step="1" value={subCalc.pisoBlocks} onChange={e=>setSubPisoBlocks(Math.max(0,Math.floor(Number(e.target.value)||0)))}/><strong>{money.format(subCalc.g27)}</strong></div><div className="sub-table-row"><span>Quantos blocos de 5 p.p. passou da META? (0,05% do fat. a cada 5 p.p.)</span><input className="orange-number" type="number" min="0" step="1" value={subCalc.metaBlocks} onChange={e=>setSubMetaBlocks(Math.max(0,Math.floor(Number(e.target.value)||0)))}/><strong>{money.format(subCalc.g28)}</strong></div></section>
    <section className="panel"><div className="panel-title"><div><p>Bonificações</p><h2>Demais bonificações — SubGerência</h2></div><span>Subtotal: {money.format(subCalc.subBonusTotal)}</span></div><div className="sub-table-head"><span>Bonificação</span><span>Indicador</span><span>Valor</span></div><div className="sub-table-row"><span>Todos os vendedores da loja bateram meta?</span><select className="orange-select" value={allSellers} onChange={e=>setAllSellers(e.target.value)}><option value=""></option><option>Todos!</option><option>Exceto 1!</option><option>Não</option></select><strong>{money.format(subCalc.g34)}</strong></div><div className="sub-table-row"><span>Quantas semanas atingiu a meta semanal da loja?</span><input className="orange-number" type="number" min="0" step="1" value={storeWeeks} onChange={e=>setStoreWeeks(Math.max(0,Math.floor(Number(e.target.value)||0)))}/><strong>{money.format(subCalc.g35)}</strong></div>{subBonusLabels.map((label,i)=><div className="sub-table-row" key={label}><span>{label}</span><Toggle value={subBonus[i]} onChange={v=>{const x=[...subBonus];x[i]=v;setSubBonus(x)}}/><strong>{money.format(subCalc.subBonusValues[i])}</strong></div>)}<div className="sub-table-row"><span>Qual foi a nota atingida no Checklist Mensal?</span><input className="orange-number" type="number" min="0" value={checklist} onChange={e=>setChecklist(Math.max(0,Number(e.target.value)||0))}/><strong>{money.format(subCalc.g40)}</strong></div></section>
    <section className="panel summary"><div className="panel-title"><div><p>Resultado</p><h2>Resumo do cálculo</h2></div></div><div className="summary-rows"><div><span>(+) Comissão</span><strong>{money.format(subCalc.commission)}</strong></div><div><span>(+) Acelerador Vendas</span><strong>{money.format(subCalc.salesAccel)}</strong></div><div><span>(+) Acelerador Gerência</span><strong>{money.format(subCalc.subAccel)}</strong></div><div><span>(+) Bônus Vendas</span><strong>{money.format(subCalc.salesBonusTotal)}</strong></div><div><span>(+) Bônus Gerência</span><strong>{money.format(subCalc.subBonusTotal)}</strong></div><div><span>(+) Salário-Base</span><strong>{money.format(baseSalary)}</strong></div><div><span>(+) DSR Comissão (aprox.)</span><strong>{money.format(subCalc.dsr)}</strong></div></div><div className="deductions"><label>Salário-Base<Num value={baseSalary} onChange={setBaseSalary}/></label><label>Retiradas<Num value={subWithdrawals} onChange={setSubWithdrawals}/></label><label>Adiantamentos<Num value={subAdvances} onChange={setSubAdvances}/></label></div><div className="grand-total"><span>Total aproximado<small>*não são considerados impostos no cálculo acima</small></span><strong>{money.format(subCalc.total)}</strong></div></section>
  </div><footer><button className="logout" onClick={resetAll}>Sair</button></footer></main>;
}
