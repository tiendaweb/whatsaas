# Inventario de PulzeCRM

Reconstruido desde el bundle de producción (`index-C7atM2KU.js`, 1.43 MB, re-impreso con esbuild
a 27 614 líneas). Todo lo que sigue está verificado contra el código, no inferido de capturas.

## 1. Rutas

```js
// pretty.js:9788
const NAV = [
  { path: "/",          label: "Dashboard", icon: LayoutDashboard },
  { path: "/leads",     label: "Leads",     icon: Sparkles },
  { path: "/deals",     label: "Deals",     icon: Handshake },
  { path: "/accounts",  label: "Accounts",  icon: Building2 },
  { path: "/contacts",  label: "Contacts",  icon: Users },
  { path: "/tasks",     label: "Tasks",     icon: CheckSquare },
  { path: "/reports",   label: "Reports",   icon: BarChart3 },
  { path: "/calendar",  label: "Calendar",  icon: Calendar },
  { path: "/settings",  label: "Settings",  icon: Settings },
];
// + /profile, /login, /signup, /forgot-password, * (404)
```

## 2. Shell / layout

`pretty.js:9789` (`function gz`). Tiene **tres modos de header**, elegibles en Settings →
Appearance → *Header Position*: `left` | `right` | `top`.

### Modo `left`/`right` — sidebar fijo de 256 px

```jsx
<header className="fixed inset-y-0 z-50 flex w-64 flex-col border-r border-border/40
                   bg-white/80 dark:bg-[#0f172a]/80 backdrop-blur-sm
                   transition-all duration-300 md:flex hidden">
  {/* marca */}
  <div className="flex items-center gap-3 p-6">
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl
                    bg-gradient-to-br from-[#3b82a8] to-[#7dd3fc]">
      <Sparkles className="h-5 w-5 text-white" />
    </div>
    <div>
      <h1 className="text-xl font-semibold">PulzeCRM</h1>
      <p className="text-xs text-muted-foreground">Sales Insights</p>
    </div>
  </div>

  <div className="px-4 mb-4"><GlobalSearch /></div>

  <nav className="flex-1 space-y-1 px-4 py-2 overflow-y-auto custom-scrollbar">
    {/* item activo:  bg-primary text-primary-foreground shadow-sm            */}
    {/* item inactivo: text-foreground/70 hover:text-foreground hover:bg-muted/50 */}
    <NavLink className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium
                        transition-all duration-200" />
  </nav>

  <div className="mt-auto border-t border-border/40 p-4 space-y-4">
    <ThemeToggle /> <Button variant="ghost" size="icon"><Settings /></Button>
    {/* avatar + "John Doe" / "Manager" → dropdown: Profile, Settings, Log out */}
  </div>
</header>
```

En móvil ese modo cae a una barra superior de 64 px + `<Sheet side="left" className="w-72 p-0">`.

### Modo `top` — pill nav centrada

```jsx
<header className="sticky top-0 z-50 border-b border-border/40 bg-white/80
                   dark:bg-[#0f172a]/80 backdrop-blur-sm">
  <div className="mx-auto flex items-center justify-between px-6 lg:px-8 py-4">
    {/* marca (mismo bloque) + subtítulo "AI-powered sales insights" */}
    <nav className="hidden md:flex items-center gap-2 rounded-full bg-muted/50 p-1">
      {/* activo: bg-primary text-primary-foreground shadow-sm, rounded-full px-4 py-2 */}
    </nav>
    {/* GlobalSearch (lg+), ThemeToggle, Sheet móvil, avatar */}
  </div>
</header>
```

### Contenedor de página

```jsx
<div className="min-h-screen bg-gradient-to-br from-[#f5f7fa] to-[#fafbfc]
                dark:from-[#0f172a] dark:to-[#1e293b] flex flex-row|flex-col">
  <Shell />
  <main className="flex-1 transition-all duration-300 md:ml-64">   {/* md:mr-64 si right */}
    <div className="mx-auto max-w-[1400px] px-6 lg:px-8 py-8"><Routes/></div>
  </main>
  {/* FAB AI Assistant, fixed bottom-6 right-6 z-40 */}
</div>
```

### FAB del asistente

```jsx
<Button className="h-14 w-14 rounded-full bg-gradient-to-br from-[#3b82a8] to-[#7dd3fc]
                   shadow-lg hover:shadow-xl transition-all relative">
  <Sparkles className="h-6 w-6 text-white" />
  <span className="absolute -top-... /* badge de notificaciones */" />
</Button>
```
Tooltip: `"AI Assistant (Press 'a')"`. Se abre también con la tecla `a`.

## 3. Dashboard (`/`)

`pretty.js:24863` (`function O6`). Encabezado:

- `h2` — **"Sales Overview"** (`text-3xl font-semibold`, `fontSize: 1.875rem`)
- `p` — "Your performance at a glance" (`fontSize: 0.9375rem`)
- Botón `variant="outline"` — ⚙ **"Customize Dashboard"**

Grid: `grid grid-cols-1 lg:grid-cols-6 gap-6`. Cada widget lleva `style={{ order, display }}`
calculados desde las preferencias, así que **el orden y la visibilidad son configurables**.

### 3.1 Catálogo de widgets (`pretty.js:10721`)

```js
const DEFAULT_WIDGETS = [
  { id:"kpi-cards",     name:"Overview Metrics",   description:"Key performance indicators",     category:"metrics",  isVisible:true, order:1 },
  { id:"forecast",      name:"Revenue Trend",      description:"Monthly revenue chart",          category:"charts",   isVisible:true, order:2 },
  { id:"pipeline",      name:"Sales Pipeline",     description:"Deals by stage donut chart",     category:"charts",   isVisible:true, order:3 },
  { id:"recent-deals",  name:"Top Deals",          description:"High-value opportunities",       category:"lists",    isVisible:true, order:4 },
  { id:"activity-feed", name:"Activity Timeline",  description:"Recent team activity",           category:"activity", isVisible:true, order:5 },
  { id:"hot-leads",     name:"Quick Actions",      description:"Fast access to common tasks",    category:"lists",    isVisible:true, order:6 },
  { id:"upcoming-tasks",name:"Calendar View",      description:"Upcoming meetings and tasks",    category:"activity", isVisible:true, order:7 },
];
```

El diálogo *Customize Dashboard* agrupa por categoría con tabs y contador:
`Metrics (1) · Charts (2) · Lists (2) · Activity (2)`.

### 3.2 `kpi-cards` — `lg:col-span-6`, grid interno `md:grid-cols-2 lg:grid-cols-4`

```js
const KPIS = [
  { title:"Total Revenue",    value:"$332,000", change:"+12.5%", trend:"up",   icon:DollarSign, color:"from-[#3b82a8] to-[#7dd3fc]", progress:75 },
  { title:"Active Leads",     value:"342",      change:"+8.2%",  trend:"up",   icon:Sparkles,   color:"from-[#6dd4a4] to-[#4ade80]", progress:68 },
  { title:"Deals Closed",     value:"23",       change:"-2.4%",  trend:"down", icon:Handshake,  color:"from-[#f9c74f] to-[#fbbf24]", progress:52 },
  { title:"Conversion Rate",  value:"6.7%",     change:"+1.2%",  trend:"up",   icon:TrendingUp, color:"from-[#a78bfa] to-[#c084fc]", progress:67 },
];
```

Componente `StatCard` (`pretty.js` ≈ `function kz`), exacto:

```jsx
<Card className="border-border/40 bg-white/80 dark:bg-card/80 backdrop-blur-sm shadow-sm
                 hover:shadow-md transition-all duration-300 group">
  <CardHeader className="flex flex-row items-center justify-between pb-2">
    <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
    <div className={`flex h-10 w-10 items-center justify-center rounded-xl
                     bg-gradient-to-br ${color} transition-transform
                     group-hover:scale-110 duration-300`}>
      <Icon className="h-5 w-5 text-white" />
    </div>
  </CardHeader>
  <CardContent className="space-y-3">
    <div className="flex items-baseline justify-between">
      <span style={{ fontWeight:700, fontSize:"1.875rem" }}>{value}</span>
      <span className={`flex items-center gap-1 text-sm font-medium
                        ${trend==="up" ? "text-[#6dd4a4]" : "text-[#ef4444]"}`}>
        {trend==="up" ? <TrendingUp className="h-4 w-4"/> : <TrendingDown className="h-4 w-4"/>}
        {change}
      </span>
    </div>
    <Progress value={progress} className="h-2" />
  </CardContent>
</Card>
```

Entrada animada: `<motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}}
transition={{delay: i*0.1}}>` — un stagger de 100 ms por tarjeta.

### 3.3 `forecast` — "Revenue Trend" · `lg:col-span-3`

Área ApexCharts, altura 300, dos series:

```js
colors: ["#3b82a8", "#6dd4a4"]
stroke: { curve:"smooth", width:[3,2], dashArray:[0,5] }   // Target va punteada
fill:   { type:"gradient", gradient:{ shadeIntensity:1, opacityFrom:0.3, opacityTo:0, stops:[0,90,100] } }
grid:   { strokeDashArray:4, xaxis:{lines:{show:false}}, yaxis:{lines:{show:true}} }
yaxis:  { labels:{ formatter: v => `$${v/1000}k` } }
legend: { show:true, position:"top", horizontalAlign:"right" }

const DATA = [
  {month:"Jan",revenue:45000,target:50000},{month:"Feb",revenue:52000,target:50000},
  {month:"Mar",revenue:48000,target:55000},{month:"Apr",revenue:61000,target:55000},
  {month:"May",revenue:58000,target:60000},{month:"Jun",revenue:68000,target:60000},
];
```
Subtítulo: "Monthly revenue vs target".

### 3.4 `pipeline` — "Deal Pipeline" · `lg:col-span-3`

Donut ApexCharts `size:"75%"`, sin leyenda propia (usa una grilla propia debajo), con total
central `"Total" / "100%"`:

```js
const STAGES = [
  { name:"Qualified",   value:35, color:"#3b82a8" },
  { name:"Proposal",    value:25, color:"#6dd4a4" },
  { name:"Negotiation", value:20, color:"#f9c74f" },
  { name:"Closed",      value:20, color:"#a78bfa" },
];
```
Leyenda propia: `<div className="mt-4 grid grid-cols-2 gap-4">` con punto `h-3 w-3 rounded-full`
y texto `"{name}: {value}%"`. Subtítulo: "Deals by stage".

### 3.5 `recent-deals` — "Top Deals"

```js
const TOP_DEALS = [
  { company:"Acme Corporation",  value:"$45,000", stage:"Negotiation", probability:85 },
  { company:"Tech Solutions Inc",value:"$32,000", stage:"Proposal",    probability:70 },
  { company:"Global Ventures",   value:"$28,500", stage:"Qualified",   probability:55 },
  { company:"Innovation Labs",   value:"$19,800", stage:"Proposal",    probability:65 },
];
```

### 3.6 `activity-feed` — "Recent Activity"

Timeline con línea vertical (`absolute left-4 top-10 bottom-0 w-0.5 bg-border/40`), icono en
círculo `h-8 w-8` con fondo `${iconColor}15` (15 % de opacidad en hex).

```js
[
  { icon:CheckCircle, iconColor:"#6dd4a4", title:"Deal Closed",       description:"Acme Corporation - $45,000",             timestamp:"2 hours ago" },
  { icon:Mail,        iconColor:"#3b82a8", title:"Email Sent",        description:"Follow-up email to Tech Solutions",      timestamp:"4 hours ago" },
  { icon:Calendar,    iconColor:"#f9c74f", title:"Meeting Scheduled", description:"Product demo with Global Ventures",      timestamp:"5 hours ago" },
  { icon:UserPlus,    iconColor:"#a78bfa", title:"New Lead",          description:"Innovation Labs added to pipeline",      timestamp:"1 day ago"  },
  { icon:FileText,    iconColor:"#3b82a8", title:"Proposal Sent",     description:"Enterprise Systems proposal delivered",  timestamp:"1 day ago"  },
]
```
Contenedor: `space-y-4 max-h-[400px] overflow-y-auto pr-2`.

### 3.7 `hot-leads` — "Quick Actions"

Cuatro botones con gradiente, cada uno abre un diálogo:

```js
[
  { icon:Sparkles, label:"New Lead",      description:"Add a new lead",   color:"from-[#3b82a8] to-[#7dd3fc]" },
  { icon:Mail,     label:"Send Email",    description:"Compose message",  color:"from-[#6dd4a4] to-[#4ade80]" },
  { icon:Phone,    label:"Schedule Call", description:"Book a call",      color:"from-[#f9c74f] to-[#fbbf24]" },
  { icon:Video,    label:"New Meeting",   description:"Set up meeting",   color:"from-[#a78bfa] to-[#c084fc]" },
]
```

### 3.8 `upcoming-tasks` — "Calendar View"

Próximos eventos/tareas, mismo modelo que `/calendar`.

### 3.9 Toast de bienvenida

Una sola vez por navegador (`localStorage["pulzecrm_welcome"]`), a los 500 ms:
`toast.success("Welcome to PulzeCRM!", "Your AI-powered sales dashboard is ready")`.

## 4. Leads (`/leads`) — `pretty.js:25136`

- Título "Leads" / "Manage and nurture your prospects" / botón **"Add New Lead"**
- KPIs de cabecera: `Total Leads`, `Hot Leads`, `Conversion Rate`
- Tabla con filtro avanzado + vistas guardadas

**Modelo:**
```ts
type Lead = {
  name: string; company: string; email: string; phone: string;
  score: number;                       // 0-100, validado
  status: "Hot" | "Warm" | "Cold";     // default "Warm"
  lastContact: string;                 // relativo: "2 hours ago"
};
```
Ejemplo real del mock: `{ name:"Sarah Johnson", company:"Acme Corporation",
email:"sarah@acme.com", phone:"+1 (555) 123-4567", score:95, status:"Hot", lastContact:"2 hours ago" }`.

**Validación del formulario** (idéntica en el port): nombre, empresa, email (regex
`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`) y teléfono obligatorios; `score` entre 0 y 100.
Mensajes: "Name is required", "Company is required", "Invalid email format", "Email is required",
"Phone is required", "Score must be between 0 and 100". Se pintan con
`<p className="text-sm text-[#ef4444] flex items-center gap-1"><AlertCircle className="h-3 w-3"/></p>`.

**Campos filtrables:** `name`, `company`, `status`, `score`, `lastContact`.

## 5. Deals (`/deals`) — `pretty.js:26852`

- Título **"Deal Pipeline"** / "Track and manage opportunities - drag to move deals"
- Botón **"Add New Deal"**
- KPIs: `Total Pipeline` ($201,800), `Active Deals`, `Avg. Deal Size` ($33,633)
- **Kanban con drag & drop entre etapas**

**Modelo:**
```ts
type Deal = {
  name: string;          // "Enterprise Plan - Acme"
  company: string;
  value: number;
  probability: number;   // 0-100
  stage: "Qualified" | "Proposal" | "Negotiation" | "Closed Won";
  expectedCloseDate: string;
  primaryContact: string;
  owner: string;
  notes: string;
};
```

Panel de detalle: "Deal Progress", "Deal Information" (Company, Owner, fecha),
"Recent Activity" ("Proposal sent to client", …), botones "Edit Deal" / "Close".

## 6. Accounts (`/accounts`) — `pretty.js:26908`

- Título "Accounts" / "Your customer organizations" / botón **"Add Account"**
- KPIs: `Total Accounts` (48), `Enterprise` (12), `Total Revenue` ($1.25M)

**Modelo:**
```ts
type Account = {
  name: string; industry: string; revenue: string; employees: string;
  location: string; status: "Active" | "Inactive" | "Prospect";
  website: string; phone: string; email: string;
  street: string; city: string; state: string; zipCode: string; country: string;
  annualRevenue: string; notes: string;
};
```
Industrias: Technology, Software, Finance, Healthcare, Retail, Manufacturing, Consulting, Other.

Detalle: "Account Information", "Location", "Customer Since" (ej. "January 2024"),
oportunidades relacionadas ("Enterprise Plan — Negotiation • 85% probability — $45,000"),
"Recent Activity".

## 7. Contacts (`/contacts`) — `pretty.js:26953`

- Título "Contacts" / "People you work with" / botón **"Add Contact"**
- KPIs: `Total Contacts`, `Active Companies` (10), `VIP Contacts`, `New This Month`

**Modelo:** `firstName`, `lastName`, `email`, `phone`, `company`, `role`/`title`,
`department`, `linkedin`, `notes`.

Detalle: "Contact Information" con acciones **Send Email** / **Call**,
"Related Opportunities", "Recent Interactions"
("Email sent: Q4 proposal follow-up", "Phone call: Discussed pricing options",
"Meeting: Product demo and Q&A").

## 8. Tasks (`/tasks`) — `pretty.js:27006`

- Título "Tasks" / "Manage your team's tasks and activities"
- Tres columnas: **To Do · In Progress · Completed** + "Clear filter"

**Modelo:**
```ts
type Task = {
  title: string; description: string;
  status: "todo" | "in-progress" | "completed";
  priority: "low" | "medium" | "high";
  dueDate: string; assignedTo: string;
  relatedTo: string; relatedType: "Lead" | "Deal" | "Contact" | "Account";
};
```

**Badges (clases literales, hay que preservarlas):**

| | clase |
|---|---|
| To Do | `bg-[#e5e7eb] text-[#64748b]` |
| In Progress | `bg-[#dbeafe] text-[#3b82a8]` |
| Completed | `bg-[#d1fae5] text-[#059669]` |
| Low | `bg-[#e5e7eb] text-[#64748b]` |
| Medium | `bg-[#fef3c7] text-[#f59e0b]` |
| High | `bg-[#fee2e2] text-[#dc2626]` |

Detalle: "Task Details", "Due Date", "Activity Log", "Notes", badge **"Overdue"**.

## 9. Reports (`/reports`) — `pretty.js:27036`

- Título "Reports & Analytics" / "Comprehensive insights into your sales performance"
- Selector de período: **Last 30 Days · Last 3 Months · Last 6 Months · Last Year · All Time**
- 4 KPIs con delta "vs last period": Total Revenue (+18.2%), Deals Closed (+24.5%),
  Win Rate (+5.3%), Avg Deal Size $2,338 (+12.1%)
- 4 tabs:

| Tab | Contenido |
|---|---|
| **Overview** | "Revenue Trend" (Monthly revenue over time) · "Leads & Deals" (Conversion performance) |
| **Sales Pipeline** | "Deal Size Distribution" (by value range) · "Sales Funnel" (Conversion rates through the pipeline) |
| **Team Performance** | "Team Leaderboard" (Performance by team member, con *Win rate*) |
| **Revenue Sources** | "Revenue by Source" · "Source Details" (Revenue breakdown by source) |

También trae **Roles & Permissions**: tabs `Users` / `Permissions`, "Permissions Matrix"
(Overview of permissions by role), "Select permissions for this role".
Roles mock: `{ name:"Admin", description:"Full system access", color:"bg-[#ef4444]", userCount:3 }`.

## 10. Calendar (`/calendar`) — `pretty.js:27182`

Título "Calendar" / "Upcoming meetings, tasks, calls and demos".

```ts
type CalendarItem = {
  title: string;
  type: "task" | "meeting" | "call" | "demo";
  date: Date; time: string;              // "09:00"
  priority: "low" | "medium" | "high";
  description: string;
  attendees: string[];
};
```

## 11. Settings (`/settings`) — `pretty.js:27141`

Secciones (cada una es una `Card` con título + descripción):

1. **Personal Information** — Full Name, Email, Phone, Job Title, Company
2. **Appearance Settings** — "Customize the layout and theme of your dashboard" → **Header Position**
3. **Notification Preferences** — 6 switches: Email notifications, Deal updates, New leads,
   Task reminders, Weekly reports, Mentions
4. **Security Settings** — Current/New/Confirm Password + Two-factor authentication
5. **Connected Services** — integraciones de terceros
6. **Email Templates** — plantillas con `Subject:` / `Body:` y variables `{{name}}`

## 12. Profile (`/profile`) — `pretty.js:27172`

Cabecera con avatar (iniciales "JD"), badge "Active" y 3 stats: `127 Deals Closed`,
`$2.4M Revenue`, `98% Satisfaction`.
Secciones: Personal Information · Change Password · Security Settings (2FA, Login Alerts) ·
Recent Activity · **Active Sessions** (Chrome on macOS — *Current*; Safari on iPhone — *Revoke*).

## 13. Transversales

| Componente | Detalle |
|---|---|
| **Global Search** | "Search…", "Search for leads, deals, contacts, accounts, and tasks." Resultados tipados: `{ type:"Lead", title:"Tech Solutions Inc", subtitle:"Qualified • $25,000", badge:"Hot" }` |
| **Filtro avanzado** | Operadores: Equals, Contains, Starts with, Ends with, Greater than, Less than, Between. Vistas guardadas con badge "Default". Botón activo: `border-[#3b82a8] bg-[#dbeafe]/30` + badge con el conteo |
| **AI Assistant** | Panel lateral. Primer mensaje: *"Hello! I'm your AI sales assistant. I can help you with lead insights, deal recommendations, and forecasting. What would you like to know?"* |
| **Import / Export** | `{ type:"export", status:"completed", totalItems:150, processedItems:150, failedItems:0, canUndo:false }` con progreso y deshacer |
| **Toasts** | Sonner. `success` / `info` / `error` con título + descripción |
| **404** | "404 · Page Not Found · The page you're looking for doesn't exist or has been moved." |
| **Footer/auth** | "© 2026 PulzeCRM — React CRM Dashboard Template", "v1.2.2" |
