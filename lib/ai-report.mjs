// 渠订通 · AI 经营分析与只读分享
// 复用真实业务库聚合；所有生成、打印、分享写入审计链。报告历史保存 data_json 快照。
import crypto from 'node:crypto';
import { APP_NAME, APP_VERSION, localDateTime, today, centsToYuan, escapeHTML, rowsToCsv } from './core.mjs';

const num=v=>Number(v||0)||0;
const sum=(rows,key)=>rows.reduce((n,r)=>n+num(r?.[key]),0);
const yuan=v=>'¥'+(num(v)/100).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2});
const pct=(a,b)=>b>0?(a/b*100).toFixed(1):'0.0';
const safeJson=v=>{try{return JSON.parse(String(v||'{}'))}catch{return {}}};
const dateOnly=v=>String(v||'').slice(0,10);
const monthStart=(d=today())=>String(d).slice(0,8)+'01';
const sanitizeReport=r=>{
  const d=safeJson(r.data_json);const out={id:r.id,report_no:r.report_no,period_from:r.period_from,period_to:r.period_to,generated_at:r.generated_at,generated_by:r.generated_by,summary:r.summary,status:r.status,data:d};
  if(d.top_customers)out.data.top_customers=d.top_customers.map(x=>({...x,phone:'',username:''}));
  return out;
};
export function calcReportData(ctx={}){
  const {db,from='',to=''}=ctx;
  const end=dateOnly(to)||today(), start=dateOnly(from)||monthStart(end), endIn=end+' 23:59:59', startIn=start+' 00:00:00';
  const between=(col)=>"COALESCE("+col+",'')>=? AND COALESCE("+col+",'')<=?";
  const orders=db.prepare("SELECT * FROM orders WHERE "+between('created_at')).all(startIn,endIn);
  const allOrders=db.prepare('SELECT * FROM orders').all();
  const orderItems=db.prepare("SELECT oi.*,o.created_at FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE "+between('o.created_at')).all(startIn,endIn);
  const returns=db.prepare("SELECT * FROM returns WHERE "+between('created_at')+" AND status='已通过'").all(startIn,endIn);
  const bills=db.prepare('SELECT * FROM bills').all();
  const payments=db.prepare("SELECT * FROM payments WHERE "+between('created_at')).all(startIn,endIn);
  const supplierPayments=db.prepare("SELECT * FROM supplier_payments WHERE "+between('occurred_at')).all(startIn,endIn);
  const products=db.prepare("SELECT * FROM products WHERE status='上架'").all();
  const stockMovements=db.prepare("SELECT * FROM stock_movements WHERE "+between('occurred_at')).all(startIn,endIn);
  const stockAdjustments=db.prepare("SELECT * FROM stock_adjustments WHERE "+between('occurred_at')).all(startIn,endIn);
  const purchaseOrders=db.prepare("SELECT * FROM purchase_orders WHERE "+between('occurred_at')).all(startIn,endIn);
  const supplierBills=db.prepare('SELECT * FROM supplier_bills').all();
  const fundTransfers=db.prepare("SELECT * FROM fund_transfers WHERE "+between('created_at')).all(startIn,endIn);
  const financeLedgers=db.prepare("SELECT * FROM finance_ledgers WHERE "+between('occurred_at')).all(startIn,endIn);
  const printJobs=db.prepare("SELECT * FROM print_jobs WHERE "+between('created_at')).all(startIn,endIn);
  const users=db.prepare("SELECT * FROM users WHERE role='customer' AND username<>'walkin'").all();
  const suppliers=db.prepare('SELECT * FROM suppliers').all();
  const sales=sum(orders,'total_cents'), prevSales=sum(allOrders.filter(o=>dateOnly(o.created_at)<start),'total_cents');
  const cost=sum(orders,'cost_cents'), gross=sum(orders,'gross_profit_cents');
  const refunds=sum(returns,'total_cents'), netSales=sales-refunds;
  const received=sum(payments.filter(p=>String(p.bill_kind||'')!=='退货'),'amount_cents');
  const paidOut=sum(supplierPayments,'amount_cents');
  const receivable=sum(bills.filter(b=>String(b.direction||'')==='应收'&&String(b.status)!=='已结清'),'balance_cents');
  const payable=sum(supplierBills.filter(b=>String(b.status)!=='已结清'),'balance_cents');
  const lowStock=products.filter(p=>num(p.stock)<=num(p.safe_stock));
  const outStock=products.filter(p=>num(p.stock)<=0);
  const pendingReturns=Number(db.prepare("SELECT COUNT(*) c FROM returns WHERE status='待审核'").get()?.c||0);
  const pendingPrints=Number(db.prepare("SELECT COUNT(*) c FROM print_jobs WHERE status='待打印'").get()?.c||0);
  const overdue=Number(db.prepare("SELECT COUNT(*) c FROM bills WHERE status!='已结清' AND balance_cents>0 AND substr(due_at,1,10)<?").get(today())?.c||0);
  const risks=num(lowStock.length)+num(overdue)+num(pendingReturns)+num(pendingPrints);
  const daily={};for(const o of orders){const k=dateOnly(o.created_at);daily[k]=(daily[k]||0)+num(o.total_cents)}
  const trend=Object.keys(daily).sort().map(k=>({date:k,sales_cents:daily[k]}));
  const topCustomers=db.prepare("SELECT u.id,u.display_name,u.company,COALESCE(SUM(o.total_cents),0) sales_cents,COUNT(o.id) order_count FROM users u LEFT JOIN orders o ON o.user_id=u.id AND o.created_at>=? AND o.created_at<=? WHERE u.role='customer' AND u.username<>'walkin' GROUP BY u.id ORDER BY sales_cents DESC,u.id LIMIT 8").all(startIn,endIn);
  const topProducts=db.prepare("SELECT oi.name,oi.sku,SUM(oi.qty) qty,SUM(oi.line_total_cents) sales_cents,SUM(COALESCE(oi.profit_cents,oi.line_total_cents-COALESCE(oi.cost_cents,0))) profit_cents FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE o.created_at>=? AND o.created_at<=? GROUP BY oi.name,oi.sku ORDER BY sales_cents DESC LIMIT 8").all(startIn,endIn);
  const dataCompleteness={orders:orders.length,order_items:orderItems.length,returns:returns.length,bills:bills.length,payments:payments.length,products:products.length,stock_movements:stockMovements.length,purchase_orders:purchaseOrders.length,supplier_bills:supplierBills.length,fund_transfers:fundTransfers.length,finance_ledgers:financeLedgers.length,print_jobs:printJobs.length,users:users.length,suppliers:suppliers.length};
  return {company:ctx.company||APP_NAME,version:APP_VERSION,period:start+' — '+end,generated_at:localDateTime(),from:start,to:end,
    revenue_cents:netSales,sales_cents:sales,net_sales_cents:netSales,gross_profit_cents:gross,cost_cents:cost,refund_cents:refunds,
    margin:pct(gross,sales),growth:prevSales>0?((sales-prevSales)/prevSales*100).toFixed(1):'0.0',receipt_rate:pct(received,sales),
    received_cents:received,paid_out_cents:paidOut,receivable_cents:receivable,payable_cents:payable,
    order_count:orders.length,order_item_count:orderItems.length,return_count:returns.length,pending_returns:pendingReturns,
    customer_count:users.length,supplier_count:suppliers.length,product_count:products.length,low_stock:lowStock.length,out_stock:outStock.length,
    risks,overdue_bills:overdue,pending_prints:pendingPrints,purchase_count:purchaseOrders.length,purchase_amount_cents:sum(purchaseOrders,'total_cents'),
    stock_movements:stockMovements.length,stock_adjustments:stockAdjustments.length,fund_count:fundTransfers.length,finance_count:financeLedgers.length,print_count:printJobs.length,
    low_stock_items:lowStock.slice(0,8).map(p=>({id:p.id,name:p.name,sku:p.sku,stock:num(p.stock),safe_stock:num(p.safe_stock)})),
    top_customers:topCustomers.map(x=>({...x,sales_cents:num(x.sales_cents)})),top_products:topProducts,trend,
    data_tables:Object.keys(dataCompleteness).length,business_tables:dataCompleteness};
}
export function reportSummary(r){
  const riskText=r.risks>0?'系统扫描到 '+r.risks+' 项风险，其中低库存 '+r.low_stock+' 项、逾期账单 '+r.overdue_bills+' 笔、待审退货 '+r.pending_returns+' 笔、待打印 '+r.pending_prints+' 单。':'系统未扫描到明显经营风险。';
  return '本期'+r.company+'实现营业收入 '+yuan(r.revenue_cents)+'，销售总额 '+yuan(r.sales_cents)+'，退货冲减 '+yuan(r.refund_cents)+'；综合毛利率 '+r.margin+'%，较上期增长 '+r.growth+'%。订单 '+r.order_count+' 单，客户 '+r.customer_count+' 家，商品 '+r.product_count+' 种，采购单 '+r.purchase_count+' 单。本期回款 '+yuan(r.received_cents)+'，回款达成率 '+r.receipt_rate+'%；当前应收 '+yuan(r.receivable_cents)+'、应付 '+yuan(r.payable_cents)+'。'+riskText+'建议优先跟进逾期应收、补齐安全库存，并复核待审退货和待打印任务。';
}
function reportNo(){return 'AIR'+today().replace(/-/g,'')+'-'+Date.now().toString().slice(-6)}
function ensureTables(db){db.exec("CREATE TABLE IF NOT EXISTS ai_reports(id INTEGER PRIMARY KEY AUTOINCREMENT,report_no TEXT UNIQUE NOT NULL,period_from TEXT NOT NULL,period_to TEXT NOT NULL,generated_at TEXT NOT NULL,user_id INTEGER DEFAULT 0,generated_by TEXT DEFAULT '',data_json TEXT NOT NULL,summary TEXT NOT NULL,status TEXT NOT NULL DEFAULT '已生成');CREATE TABLE IF NOT EXISTS ai_report_prints(id INTEGER PRIMARY KEY AUTOINCREMENT,report_id INTEGER NOT NULL,user_id INTEGER DEFAULT 0,created_at TEXT NOT NULL);CREATE TABLE IF NOT EXISTS ai_report_shares(id INTEGER PRIMARY KEY AUTOINCREMENT,report_id INTEGER NOT NULL,token_hash TEXT UNIQUE NOT NULL,created_by INTEGER DEFAULT 0,created_at TEXT NOT NULL,expires_at TEXT NOT NULL,revoked INTEGER NOT NULL DEFAULT 0,view_count INTEGER NOT NULL DEFAULT 0);CREATE INDEX IF NOT EXISTS idx_ai_reports_generated ON ai_reports(generated_at DESC,id DESC);CREATE INDEX IF NOT EXISTS idx_ai_shares_token ON ai_report_shares(token_hash);")}
function shareToken(){return crypto.randomBytes(24).toString('base64url')}
function tokenHash(t){return crypto.createHash('sha256').update(String(t||'')).digest('hex')}
function reportRow(db,id){return db.prepare('SELECT * FROM ai_reports WHERE id=?').get(Number(id)||0)}
function reportExportRows(r){const d=safeJson(r.data_json);return [['报告编号',r.report_no],['周期',r.period_from+' — '+r.period_to],['生成时间',r.generated_at],['生成人',r.generated_by],['营业收入',yuan(d.revenue_cents)],['销售总额',yuan(d.sales_cents)],['毛利',yuan(d.gross_profit_cents)],['毛利率',d.margin+'%'],['回款',yuan(d.received_cents)],['应收',yuan(d.receivable_cents)],['应付',yuan(d.payable_cents)],['订单数',d.order_count],['退货数',d.return_count],['客户数',d.customer_count],['低库存',d.low_stock],['风险',d.risks],['摘要',r.summary]]}
function reportDocHtml(r){const d=safeJson(r.data_json);return '<!doctype html><html><head><meta charset="utf-8"><title>'+escapeHTML(r.report_no)+'</title><style>body{font-family:"Microsoft YaHei",Arial;margin:36px;color:#172033}h1{text-align:center;color:#0f3b68}table{width:100%;border-collapse:collapse;margin:16px 0}th,td{border:1px solid #aac0d5;padding:8px;font-size:13px}th{background:#edf6ff}.small{color:#667;font-size:12px}</style></head><body><h1>渠订通 · AI 经营报告</h1><p>报告编号：'+escapeHTML(r.report_no)+'　周期：'+escapeHTML(r.period_from+' — '+r.period_to)+'　生成：'+escapeHTML(r.generated_at)+'</p><h3>经营摘要</h3><p>'+escapeHTML(r.summary)+'</p><h3>核心指标</h3><table>'+reportExportRows(r).slice(5).map(x=>'<tr><th>'+escapeHTML(x[0])+'</th><td>'+escapeHTML(String(x[1]))+'</td></tr>').join('')+'</table><p class="small">数据来源：渠订通真实业务数据库快照；生成版本 '+escapeHTML(d.version||APP_VERSION)+'。</p></body></html>'}
export async function handleAiReport(ctx){
  const {p,m,b,res,req,u,json,fail,db,tx,audit,ip,bumpRevision,broadcast,getSetting,revision,userOf}=ctx;
  ensureTables(db);
  const company=String(getSetting('site_name',getSetting('company_profile_name',APP_NAME))||APP_NAME);
  const perms=x=>{try{return JSON.parse(String(x?.permissions||'[]'))}catch{return []}};
  const has=(x,k)=>!!x&&(x.role==='admin'||perms(x).includes('*')||perms(x).includes(k)||(['ai_report:view','ai_report:generate','ai_report:share'].includes(k)&&(perms(x).includes('dashboard:view')||perms(x).includes('sales_stats:view'))));
  const needUser=(key='ai_report:view')=>{const x=userOf(req);if(!x){fail(res,'未登录或会话已过期',401);return null}if(!has(x,key)){fail(res,'无权限访问 AI 经营分析',403);return null}return x};
  if(p==='/api/admin/ai-report/data'&&m==='GET'){
    const x=needUser();if(!x)return true;
    const data=calcReportData({db,from:String(u.searchParams.get('from')||''),to:String(u.searchParams.get('to')||''),company});
    return json(res,{ok:true,data,summary:reportSummary(data),report_count:Number(db.prepare('SELECT COUNT(*) c FROM ai_reports').get()?.c||0),business_tables:data.business_tables}),true;
  }
  if(p==='/api/admin/ai-report/generate'&&m==='POST'){
    const x=needUser('ai_report:generate');if(!x)return true;
    const data=calcReportData({db,from:String(b.from||''),to:String(b.to||''),company}),summary=reportSummary(data),no=reportNo(),at=localDateTime(),uid=Number(x.id||0),by=String(x.display_name||x.username||'');
    let id=0;tx(()=>{const ins=db.prepare('INSERT INTO ai_reports(report_no,period_from,period_to,generated_at,user_id,generated_by,data_json,summary,status) VALUES(?,?,?,?,?,?,?,?,?)').run(no,data.from,data.to,at,uid,by,JSON.stringify(data),summary,'已生成');id=Number(ins.lastInsertRowid)});
    audit(x,'ai_report_generate',no,{from:data.from,to:data.to,revenue_cents:data.revenue_cents},ip(req));bumpRevision();broadcast('refresh',{ai_report:no});
    return json(res,{ok:true,id,report_no:no,data,summary}),true;
  }
  if(p==='/api/admin/ai-report/reports'&&m==='GET'){
    const x=needUser();if(!x)return true;const rows=db.prepare('SELECT * FROM ai_reports ORDER BY generated_at DESC,id DESC LIMIT 50').all().map(sanitizeReport);return json(res,{ok:true,rows}),true;
  }
  if(p.startsWith('/api/admin/ai-report/reports/')&&p.endsWith('/export')&&m==='GET'){
    const x=needUser();if(!x)return true;const parts=p.split('/'),id=Number(parts[5])||0,fmt=String(u.searchParams.get('fmt')||'json'),r=reportRow(db,id);if(!r)return fail(res,'报告不存在',404),true;
    audit(x,'ai_report_export',r.report_no,{fmt},ip(req));
    if(fmt==='doc'){res.writeHead(200,{'Content-Type':'application/msword; charset=utf-8','Content-Disposition':'attachment; filename="'+r.report_no+'.doc"','Cache-Control':'no-store'});return res.end('\ufeff'+reportDocHtml(r)),true}
    if(fmt==='csv'){res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="'+r.report_no+'.csv"','Cache-Control':'no-store'});return res.end(rowsToCsv(['指标','数值'],reportExportRows(r))),true}
    return json(res,{ok:true,report:sanitizeReport(r)}),true;
  }
  if(p.startsWith('/api/admin/ai-report/reports/')&&m==='GET'){
    const x=needUser();if(!x)return true;const id=Number(p.split('/').pop())||0,r=reportRow(db,id);if(!r)return fail(res,'报告不存在',404),true;return json(res,{ok:true,report:sanitizeReport(r)}),true;
  }
  if(p.startsWith('/api/admin/ai-report/reports/')&&p.endsWith('/print')&&m==='POST'){
    const x=needUser();if(!x)return true;const id=Number(p.split('/')[5])||0,r=reportRow(db,id);if(!r)return fail(res,'报告不存在',404),true;
    db.prepare('INSERT INTO ai_report_prints(report_id,user_id,created_at) VALUES(?,?,?)').run(id,Number(x.id||0),localDateTime());audit(x,'ai_report_print',r.report_no,{report_id:id},ip(req));return json(res,{ok:true}),true;
  }
  if(p==='/api/admin/ai-report/share'&&m==='POST'){
    const x=needUser('ai_report:share');if(!x)return true;const id=Number(b.report_id||0)||0,r=reportRow(db,id);if(!r)return fail(res,'报告不存在',404),true;
    const token=shareToken(),expires=Number(b.expires_hours||72)||72,expiresAt=localDateTime(new Date(Date.now()+expires*3600*1000));
    db.prepare('INSERT INTO ai_report_shares(report_id,token_hash,created_by,created_at,expires_at,revoked,view_count) VALUES(?,?,?,?,?,0,0)').run(id,tokenHash(token),Number(x.id||0),localDateTime(),expiresAt);
    audit(x,'ai_report_share_create',r.report_no,{expires_hours:expires},ip(req));bumpRevision();
    return json(res,{ok:true,token,url:'/public/ai/share/'+token,expires_at:expiresAt}),true;
  }
  if(p==='/api/admin/ai-report/shares'&&m==='GET'){
    const x=needUser();if(!x)return true;const rows=db.prepare('SELECT s.id,s.report_id,r.report_no,s.created_at,s.expires_at,s.revoked,s.view_count FROM ai_report_shares s LEFT JOIN ai_reports r ON r.id=s.report_id ORDER BY s.id DESC LIMIT 50').all();return json(res,{ok:true,rows}),true;
  }
  if(p.startsWith('/api/admin/ai-report/shares/')&&p.endsWith('/revoke')&&m==='POST'){
    const x=needUser();if(!x)return true;const id=Number(p.split('/')[5])||0;db.prepare('UPDATE ai_report_shares SET revoked=1 WHERE id=?').run(id);audit(x,'ai_report_share_revoke','#'+id,{},ip(req));bumpRevision();return json(res,{ok:true}),true;
  }
  if(p==='/api/admin/ai-report/chat'&&m==='POST'){
    const x=needUser();if(!x)return true;const data=calcReportData({db,from:String(b.from||''),to:String(b.to||''),company}),q=String(b.q||'').trim();let answer='';
    if(/经营|月报|报告|汇总/.test(q))answer='本期营业收入 '+yuan(data.revenue_cents)+'，销售 '+yuan(data.sales_cents)+'，毛利 '+yuan(data.gross_profit_cents)+'，毛利率 '+data.margin+'%，订单 '+data.order_count+' 单。'+reportSummary(data);
    else if(/回款|应收|逾期/.test(q))answer='本期回款 '+yuan(data.received_cents)+'，回款达成率 '+data.receipt_rate+'%，当前应收 '+yuan(data.receivable_cents)+'，逾期账单 '+data.overdue_bills+' 笔。建议优先跟进大额未结账单。';
    else if(/库存|补货|报损/.test(q))answer='当前在售商品 '+data.product_count+' 种，低库存 '+data.low_stock+' 项、零库存 '+data.out_stock+' 项。'+(data.low_stock_items.length?'重点：'+data.low_stock_items.slice(0,5).map(x=>x.name+'('+x.stock+'/'+x.safe_stock+')').join('、'):'库存健康。');
    else if(/采购|供应商|应付/.test(q))answer='本期采购单 '+data.purchase_count+' 单，采购金额 '+yuan(data.purchase_amount_cents)+'，当前应付 '+yuan(data.payable_cents)+'，供应商 '+data.supplier_count+' 家。';
    else if(/退货|打印|工单|风险/.test(q))answer='本期通过退货 '+data.return_count+' 笔，待审退货 '+data.pending_returns+' 笔，待打印 '+data.pending_prints+' 单，风险项 '+data.risks+' 项。建议先清理待审退货和未出单任务。';
    else answer='已读取渠订通真实业务数据：'+Object.keys(data.business_tables).length+' 类业务表。本期营收 '+yuan(data.revenue_cents)+'，毛利率 '+data.margin+'%，风险 '+data.risks+' 项。可询问经营、回款、库存、采购、退货或风险。';
    return json(res,{ok:true,answer,data:{revenue_cents:data.revenue_cents,margin:data.margin,risks:data.risks}}),true;
  }
  if(p==='/api/admin/ai-report/events'&&m==='GET'){
    const x=needUser();if(!x)return true;const noisy=new Set(['license_sync','license_activate','login']);const rows=db.prepare("SELECT action,target,created_at,actor_name FROM auditdb.audit_logs ORDER BY id DESC LIMIT 80").all().filter(r=>!noisy.has(String(r.action||''))).slice(0,12).map(r=>({title:r.action||'业务动作',desc:r.target||'',time:String(r.created_at||''),actor:r.actor_name||''}));return json(res,{ok:true,rows,revision:revision?revision():1}),true;
  }
  if(p==='/api/admin/ai-report/screen'&&m==='GET'){
    const x=needUser();if(!x)return true;
    const allScope=String(u.searchParams.get('scope')||'')==='all';
    const data=calcReportData({db,from:allScope?'2000-01-01':String(u.searchParams.get('from')||''),to:allScope?today():String(u.searchParams.get('to')||''),company});
    const day=String(u.searchParams.get('day')||today());
    const q=(sql,...a)=>{try{return db.prepare(sql).all(...a)}catch(e){return []}};
    const one=(sql,...a)=>{try{return db.prepare(sql).get(...a)||{}}catch(e){return {}}};
    const recent_orders=q("SELECT o.order_no,o.total_cents,o.status,o.source,o.created_at,COALESCE(NULLIF(o.customer_snapshot,''),u.company,u.display_name,o.order_no) customer FROM orders o LEFT JOIN users u ON u.id=o.user_id ORDER BY o.created_at DESC,o.id DESC LIMIT 8");
    const recent_returns=q("SELECT r.return_no,r.total_cents,r.status,r.kind,r.created_at,COALESCE(u.company,u.display_name,r.return_no) customer FROM returns r LEFT JOIN users u ON u.id=r.user_id ORDER BY r.created_at DESC,r.id DESC LIMIT 8");
    const recent_products=q("SELECT p.name,p.sku,p.stock,p.safe_stock,p.retail_cents,p.cost_cents,COALESCE((SELECT MAX(sm.occurred_at) FROM stock_movements sm WHERE sm.product_id=p.id),p.updated_at,p.created_at) AS occurred_at FROM products p WHERE p.status='上架' ORDER BY occurred_at DESC,p.id DESC LIMIT 8");
    const recent_income=q("SELECT ('RC'||p.id) doc_no,p.amount_cents,p.bill_kind kind,p.pay_method,p.note,p.created_at occurred_at,COALESCE(u.company,u.display_name,'客户') party FROM payments p LEFT JOIN users u ON u.id=p.user_id ORDER BY p.created_at DESC,p.id DESC LIMIT 8");
    const recent_expense=q("SELECT ('SP'||sp.id) doc_no,sp.amount_cents,COALESCE(s.name,'供应商') kind,sp.pay_method,sp.note,sp.occurred_at,COALESCE(s.name,'供应商') party FROM supplier_payments sp LEFT JOIN suppliers s ON s.id=sp.supplier_id ORDER BY sp.occurred_at DESC,sp.id DESC LIMIT 8");
    for(const r of recent_expense){ }
    const ledger_income=q("SELECT record_no doc_no,amount_cents,category kind,account pay_method,note,occurred_at,COALESCE(NULLIF(party,''),handler,'财务') party FROM finance_ledgers WHERE kind='收入' ORDER BY occurred_at DESC,id DESC LIMIT 8");
    const ledger_expense=q("SELECT record_no doc_no,amount_cents,category kind,account pay_method,note,occurred_at,COALESCE(NULLIF(party,''),handler,'财务') party FROM finance_ledgers WHERE kind='支出' ORDER BY occurred_at DESC,id DESC LIMIT 8");
    const recent_finance=[...recent_income.map(x=>({...x,flow:'收入'})),...ledger_income.map(x=>({...x,flow:'收入'})),...recent_expense.map(x=>({...x,flow:'支出'})),...ledger_expense.map(x=>({...x,flow:'支出'}))].sort((a,b)=>String(b.occurred_at||'').localeCompare(String(a.occurred_at||''))).slice(0,12);
    const recent_prints=q("SELECT order_no doc_no,status,printer,created_at occurred_at FROM print_jobs ORDER BY created_at DESC,id DESC LIMIT 6");
    const recent_stock=q("SELECT product_name name,sku,direction kind,qty_delta qty,source_no doc_no,occurred_at FROM stock_movements ORDER BY occurred_at DESC,id DESC LIMIT 6");
    const feeds=[...recent_orders.map(x=>({type:'开单',title:x.order_no,desc:(x.customer||'客户')+' · '+yuan(x.total_cents),time:x.created_at,icon:'单'})),
      ...recent_returns.map(x=>({type:'退货',title:x.return_no,desc:(x.customer||'客户')+' · '+x.status+' · '+yuan(x.total_cents),time:x.created_at,icon:'退'})),
      ...recent_finance.map(x=>({type:x.flow,title:x.doc_no,desc:(x.party||'往来')+' · '+(x.kind||'')+' · '+yuan(x.amount_cents),time:x.occurred_at,icon:x.flow==='收入'?'收':'支'})),
      ...recent_products.map(x=>({type:'商品',title:x.name,desc:x.sku+' · 库存 '+Number(x.stock||0)+' / 安全 '+Number(x.safe_stock||0),time:x.occurred_at,icon:'货'})),
      ...recent_prints.map(x=>({type:'打印',title:x.doc_no,desc:x.status+' · '+(x.printer||'默认'),time:x.occurred_at,icon:'印'})),
      ...recent_stock.map(x=>({type:'库存',title:x.name,desc:x.kind+' · '+(x.qty>0?'+':'')+Number(x.qty||0),time:x.occurred_at,icon:'库'})),
      ...q("SELECT action title,target desc,created_at time,actor_name actor FROM auditdb.audit_logs WHERE action NOT IN ('license_sync','license_activate','login') ORDER BY id DESC LIMIT 10").map(x=>({...x,type:'审计',icon:'审'}))
    ].filter(x=>x.time).sort((a,b)=>String(b.time||'').localeCompare(String(a.time||''))).slice(0,40);
    const t=one("SELECT COALESCE(SUM(total_cents),0) c FROM orders WHERE substr(created_at,1,10)=?",day).c||0;
    const ti=one("SELECT COALESCE(SUM(amount_cents),0) c FROM payments WHERE substr(created_at,1,10)=? AND bill_kind<>'退货'",day).c||0;
    const to=one("SELECT COALESCE(SUM(amount_cents),0) c FROM supplier_payments WHERE substr(occurred_at,1,10)=?",day).c||0;
    const lri=one("SELECT COALESCE(SUM(amount_cents),0) c FROM finance_ledgers WHERE kind='收入' AND substr(occurred_at,1,10)=?",day).c||0;
    const lro=one("SELECT COALESCE(SUM(amount_cents),0) c FROM finance_ledgers WHERE kind='支出' AND substr(occurred_at,1,10)=?",day).c||0;
    const today_income=Number(ti)+Number(lri),today_expense=Number(to)+Number(lro);
    const today_orders=Number(one("SELECT COUNT(*) c FROM orders WHERE substr(created_at,1,10)=?",day).c||0);
    const today_returns=Number(one("SELECT COUNT(*) c FROM returns WHERE substr(created_at,1,10)=?",day).c||0);
    const annual_revenue=Number(one("SELECT COALESCE(SUM(total_cents),0) c FROM orders WHERE substr(created_at,1,4)=substr(?,1,4)",day).c||0);
    const month_revenue=Number(one("SELECT COALESCE(SUM(total_cents),0) c FROM orders WHERE substr(created_at,1,7)=substr(?,1,7)",day).c||0);
    const total_revenue=Number(one("SELECT COALESCE(SUM(total_cents),0) c FROM orders").c||0);
    const total_income=Number(one("SELECT COALESCE(SUM(amount_cents),0) c FROM payments WHERE bill_kind<>'退货'").c||0)+Number(one("SELECT COALESCE(SUM(amount_cents),0) c FROM finance_ledgers WHERE kind='收入'").c||0);
    const total_expense=Number(one("SELECT COALESCE(SUM(amount_cents),0) c FROM supplier_payments").c||0)+Number(one("SELECT COALESCE(SUM(amount_cents),0) c FROM finance_ledgers WHERE kind='支出'").c||0);
    const alerts=[...data.low_stock_items.slice(0,3).map(x=>({title:'库存预警',desc:x.name+' 低于安全库存 '+x.safe_stock,time:localDateTime(),icon:'警'})),
      ...recent_returns.map(x=>({title:'退货动态',desc:x.return_no+' · '+x.status,time:x.created_at,icon:'退'})),
      ...q("SELECT bill_no title,balance_cents,created_at time FROM bills WHERE status!='已结清' AND balance_cents>0 ORDER BY created_at DESC LIMIT 3").map(x=>({title:'应收待跟进',desc:x.title+' · '+yuan(x.balance_cents),time:x.time,icon:'账'})),
      ...recent_prints.map(x=>({title:'打印任务',desc:x.doc_no+' · '+x.status,time:x.occurred_at,icon:'印'}))
    ].sort((a,b)=>String(b.time||'').localeCompare(String(a.time||''))).slice(0,8);
    const months=[];for(let i=1;i<=12;i++){const mm=String(i).padStart(2,'0'),v=Number(one("SELECT COALESCE(SUM(total_cents),0) c FROM orders WHERE substr(created_at,1,7)=?",String(day).slice(0,4)+'-'+mm).c||0);months.push({month:mm+'月',sales_cents:v,income_cents:Number(one("SELECT COALESCE(SUM(amount_cents),0) c FROM payments WHERE substr(created_at,1,7)=?",String(day).slice(0,4)+'-'+mm).c||0)})}
    const health=Math.max(60,100-Number(data.risks||0)*3),stockHealth=Number(data.product_count||0)?Math.max(60,100-Math.round(Number(data.low_stock||0)/Number(data.product_count||1)*100)):100,response=Math.max(70,100-Number(data.pending_prints||0)*2);
    return json(res,{ok:true,data:{...data,company,day,annual_revenue,month_revenue,total_revenue,today_sales_cents:Number(t),today_order_count:today_orders,today_return_count:today_returns,today_income_cents:today_income,today_expense_cents:today_expense,total_income_cents:total_income,total_expense_cents:total_expense,months,health,stock_health:stockHealth,receipt_rate:data.receipt_rate,response},recent_orders,recent_returns,recent_products,recent_finance,alerts,feeds,events:feeds.slice(0,12),revision:revision?revision():1}),true;
  }
  const sm=p.match(/^\/public\/ai\/share\/([A-Za-z0-9_-]+)$/);
  if(sm&&m==='GET'){
    const h=tokenHash(sm[1]),s=db.prepare('SELECT * FROM ai_report_shares WHERE token_hash=? AND revoked=0').get(h);if(!s)return fail(res,'分享链接不存在或已撤销',404),true;
    if(String(s.expires_at||'')<localDateTime())return fail(res,'分享链接已过期',410),true;
    const r=reportRow(db,Number(s.report_id)||0);if(!r)return fail(res,'报告不存在',404),true;
    if(Number(s.view_count||0)>=500)return fail(res,'分享链接访问次数已达上限',429),true;
    db.prepare('UPDATE ai_report_shares SET view_count=view_count+1 WHERE id=?').run(s.id);
    audit({id:0,username:'public-share'},'ai_report_share_view',r.report_no,{share_id:s.id},ip(req));
    const rep=sanitizeReport(r);delete rep.generated_by;return json(res,{ok:true,company,report:rep,expires_at:s.expires_at,view_count:Number(s.view_count||0)+1}),true;
  }
  return false;
}
