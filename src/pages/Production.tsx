import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from 'recharts'
import { Plus, Factory, Timer, CheckCircle, AlertTriangle, Droplets, Thermometer, Settings, PlayCircle, PauseCircle } from "lucide-react"
import { useState } from "react"

// البيانات الوهمية
const productionLines = [
  {
    id: 1,
    name: "خط الإنتاج الأول",
    status: "active",
    capacity: "500 لتر/ساعة",
    currentProduction: 350,
    efficiency: 85,
    temperature: 28,
    pressure: 2.1,
    oilQuality: "ممتاز",
    operator: "أحمد محمد",
    startTime: "08:00",
    estimatedCompletion: "16:30"
  },
  {
    id: 2,
    name: "خط الإنتاج الثاني",
    status: "maintenance",
    capacity: "400 لتر/ساعة",
    currentProduction: 0,
    efficiency: 0,
    temperature: 25,
    pressure: 0,
    oilQuality: "-",
    operator: "محمد أحمد",
    startTime: "-",
    estimatedCompletion: "14:00"
  },
  {
    id: 3,
    name: "خط الإنتاج الثالث",
    status: "idle",
    capacity: "600 لتر/ساعة",
    currentProduction: 0,
    efficiency: 0,
    temperature: 24,
    pressure: 0,
    oilQuality: "-",
    operator: "سارة علي",
    startTime: "-",
    estimatedCompletion: "-"
  }
]

const hourlyProduction = [
  { hour: '08:00', production: 45, target: 50 },
  { hour: '09:00', production: 52, target: 50 },
  { hour: '10:00', production: 48, target: 50 },
  { hour: '11:00', production: 55, target: 50 },
  { hour: '12:00', production: 35, target: 50 },
  { hour: '13:00', production: 60, target: 50 },
  { hour: '14:00', production: 58, target: 50 },
  { hour: '15:00', production: 53, target: 50 }
]

const qualityMetrics = [
  { name: 'ممتاز', value: 65, color: '#22c55e' },
  { name: 'جيد جداً', value: 25, color: '#3b82f6' },
  { name: 'جيد', value: 8, color: '#f59e0b' },
  { name: 'مقبول', value: 2, color: '#ef4444' }
]

const recentBatches = [
  {
    id: "B2024-001",
    oliveType: "الزيتون البري",
    quantity: "2500 كغ",
    oilProduced: "425 لتر",
    quality: "ممتاز",
    status: "مكتمل",
    date: "2024-01-15",
    operator: "أحمد محمد"
  },
  {
    id: "B2024-002",
    oliveType: "زيتون النبالي",
    quantity: "1800 كغ",
    oilProduced: "310 لتر",
    quality: "جيد جداً",
    status: "قيد المعالجة",
    date: "2024-01-15",
    operator: "محمد أحمد"
  },
  {
    id: "B2024-003",
    oliveType: "زيتون الصوراني",
    quantity: "3200 كغ",
    oilProduced: "580 لتر",
    quality: "ممتاز",
    status: "مكتمل",
    date: "2024-01-14",
    operator: "سارة علي"
  }
]

function getStatusColor(status: string) {
  switch (status) {
    case 'active': return 'bg-green-500 text-white'
    case 'maintenance': return 'bg-yellow-500 text-white'
    case 'idle': return 'bg-gray-500 text-white'
    default: return 'bg-gray-500 text-white'
  }
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'active': return <PlayCircle className="h-4 w-4" />
    case 'maintenance': return <Settings className="h-4 w-4" />
    case 'idle': return <PauseCircle className="h-4 w-4" />
    default: return <PauseCircle className="h-4 w-4" />
  }
}

function getStatusText(status: string) {
  switch (status) {
    case 'active': return 'نشط'
    case 'maintenance': return 'صيانة'
    case 'idle': return 'متوقف'
    default: return 'غير معروف'
  }
}

export default function Production() {
  const [selectedLine, setSelectedLine] = useState<number | null>(null)

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">إدارة الإنتاج</h2>
        <div className="flex items-center space-x-2 space-x-reverse">
          <Dialog>
            <DialogTrigger asChild>
              <Button className="shadow-soft transition-smooth hover:shadow-olive">
                <Plus className="ml-2 h-4 w-4" />
                دفعة إنتاج جديدة
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>إضافة دفعة إنتاج جديدة</DialogTitle>
                <DialogDescription>
                  أدخل تفاصيل دفعة الإنتاج الجديدة
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="oliveType" className="text-right">
                    نوع الزيتون
                  </Label>
                  <Select>
                    <SelectTrigger className="col-span-3">
                      <SelectValue placeholder="اختر نوع الزيتون" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="wild">الزيتون البري</SelectItem>
                      <SelectItem value="nabali">زيتون النبالي</SelectItem>
                      <SelectItem value="sourani">زيتون الصوراني</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="quantity" className="text-right">
                    الكمية (كغ)
                  </Label>
                  <Input id="quantity" placeholder="2500" className="col-span-3" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="line" className="text-right">
                    خط الإنتاج
                  </Label>
                  <Select>
                    <SelectTrigger className="col-span-3">
                      <SelectValue placeholder="اختر خط الإنتاج" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">خط الإنتاج الأول</SelectItem>
                      <SelectItem value="2">خط الإنتاج الثاني</SelectItem>
                      <SelectItem value="3">خط الإنتاج الثالث</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="notes" className="text-right">
                    ملاحظات
                  </Label>
                  <Textarea id="notes" placeholder="ملاحظات إضافية..." className="col-span-3" />
                </div>
              </div>
              <Button className="w-full">بدء الإنتاج</Button>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">نظرة عامة</TabsTrigger>
          <TabsTrigger value="lines">خطوط الإنتاج</TabsTrigger>
          <TabsTrigger value="batches">دفعات الإنتاج</TabsTrigger>
          <TabsTrigger value="quality">مراقبة الجودة</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card className="shadow-soft transition-smooth hover:shadow-olive">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">الإنتاج اليومي</CardTitle>
                <Factory className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">1,315 لتر</div>
                <p className="text-xs text-muted-foreground">
                  +12% من أمس
                </p>
              </CardContent>
            </Card>
            <Card className="shadow-soft transition-smooth hover:shadow-olive">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">الكفاءة الإجمالية</CardTitle>
                <Timer className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">87%</div>
                <p className="text-xs text-muted-foreground">
                  +3% من الأسبوع الماضي
                </p>
              </CardContent>
            </Card>
            <Card className="shadow-soft transition-smooth hover:shadow-olive">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">خطوط نشطة</CardTitle>
                <CheckCircle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">1 / 3</div>
                <p className="text-xs text-muted-foreground">
                  2 في الصيانة
                </p>
              </CardContent>
            </Card>
            <Card className="shadow-soft transition-smooth hover:shadow-olive">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">دفعات مكتملة</CardTitle>
                <Droplets className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">24</div>
                <p className="text-xs text-muted-foreground">
                  اليوم
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
            <Card className="col-span-4 shadow-soft transition-smooth hover:shadow-olive">
              <CardHeader>
                <CardTitle>الإنتاج اليومي</CardTitle>
              </CardHeader>
              <CardContent className="pl-2">
                <ResponsiveContainer width="100%" height={350}>
                  <BarChart data={hourlyProduction}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="hour" />
                    <YAxis />
                    <Bar dataKey="production" fill="hsl(var(--primary))" />
                    <Bar dataKey="target" fill="hsl(var(--muted))" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card className="col-span-3 shadow-soft transition-smooth hover:shadow-olive">
              <CardHeader>
                <CardTitle>توزيع الجودة</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={350}>
                  <PieChart>
                    <Pie
                      data={qualityMetrics}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      fill="#8884d8"
                    >
                      {qualityMetrics.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-col gap-2 mt-4">
                  {qualityMetrics.map((metric, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: metric.color }}
                      />
                      <span className="text-sm">{metric.name}: {metric.value}%</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="lines" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {productionLines.map((line) => (
              <Card key={line.id} className="shadow-soft transition-smooth hover:shadow-olive">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{line.name}</CardTitle>
                    <Badge className={getStatusColor(line.status)}>
                      {getStatusIcon(line.status)}
                      <span className="mr-1">{getStatusText(line.status)}</span>
                    </Badge>
                  </div>
                  <CardDescription>السعة: {line.capacity}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>الكفاءة</span>
                      <span>{line.efficiency}%</span>
                    </div>
                    <Progress value={line.efficiency} className="h-2" />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="flex items-center gap-2">
                      <Thermometer className="h-4 w-4 text-muted-foreground" />
                      <span>{line.temperature}°م</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Droplets className="h-4 w-4 text-muted-foreground" />
                      <span>{line.pressure} بار</span>
                    </div>
                  </div>

                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">المشغل:</span>
                      <span>{line.operator}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">بداية الوردية:</span>
                      <span>{line.startTime}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">انتهاء متوقع:</span>
                      <span>{line.estimatedCompletion}</span>
                    </div>
                  </div>

                  <Button 
                    variant="outline" 
                    className="w-full"
                    onClick={() => setSelectedLine(line.id)}
                  >
                    عرض التفاصيل
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="batches" className="space-y-4">
          <Card className="shadow-soft transition-smooth hover:shadow-olive">
            <CardHeader>
              <CardTitle>دفعات الإنتاج الأخيرة</CardTitle>
              <CardDescription>
                قائمة بآخر دفعات الإنتاج مع تفاصيل الجودة والكمية
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {recentBatches.map((batch) => (
                  <div key={batch.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{batch.id}</span>
                        <Badge variant={batch.status === 'مكتمل' ? 'default' : 'secondary'}>
                          {batch.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {batch.oliveType} - {batch.quantity}
                      </p>
                      <p className="text-sm">
                        إنتج: {batch.oilProduced} | الجودة: {batch.quality}
                      </p>
                    </div>
                    <div className="text-right text-sm text-muted-foreground">
                      <p>{batch.date}</p>
                      <p>{batch.operator}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="quality" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="shadow-soft transition-smooth hover:shadow-olive">
              <CardHeader>
                <CardTitle>مراقبة الجودة في الوقت الفعلي</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>حموضة الزيت</span>
                    <span className="text-green-600">0.3%</span>
                  </div>
                  <Progress value={30} className="h-2" />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>معامل الانكسار</span>
                    <span className="text-green-600">1.4682</span>
                  </div>
                  <Progress value={85} className="h-2" />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>رقم البيروكسيد</span>
                    <span className="text-green-600">8.5</span>
                  </div>
                  <Progress value={75} className="h-2" />
                </div>
              </CardContent>
            </Card>
            
            <Card className="shadow-soft transition-smooth hover:shadow-olive">
              <CardHeader>
                <CardTitle>تنبيهات الجودة</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2 p-2 bg-green-50 rounded-lg">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span className="text-sm">جميع المعايير ضمن الحدود المقبولة</span>
                </div>
                <div className="flex items-center gap-2 p-2 bg-yellow-50 rounded-lg">
                  <AlertTriangle className="h-4 w-4 text-yellow-600" />
                  <span className="text-sm">مراجعة درجة الحرارة في الخط الثاني</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}