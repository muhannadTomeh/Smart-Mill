import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { Bell, BellOff, CheckCircle, AlertTriangle, Info, X, Search, Filter, Trash2, Settings, Archive } from "lucide-react"
import { useState } from "react"

// البيانات الوهمية للتنبيهات
const notifications = [
  {
    id: 1,
    type: "warning",
    title: "مخزون منخفض: الزيت",
    message: "المخزون الحالي: 50 كغم. الحد الأدنى: 100 كغم",
    timestamp: "منذ 5 دقائق",
    isRead: false,
    priority: "high",
    action: "مراجعة المخزون",
    category: "inventory"
  },
  {
    id: 2,
    type: "success",
    title: "اكتملت فاتورة الزبون أحمد محمد",
    message: "تم إنتاج 45 كغم من زيت الزيتون البكر الممتاز",
    timestamp: "منذ ساعة",
    isRead: false,
    priority: "medium",
    action: "عرض الفاتورة",
    category: "production"
  },
  {
    id: 3,
    type: "info",
    title: "زبون جديد في الطابور",
    message: "الزبون محمود عبدالله أضيف إلى الطابور",
    timestamp: "منذ ساعتين",
    isRead: true,
    priority: "medium",
    action: "عرض الطابور",
    category: "orders"
  },
  {
    id: 4,
    type: "error",
    title: "تنبيه: مصروف كبير",
    message: "تم تسجيل مصروف بقيمة 500 شيكل للصيانة",
    timestamp: "منذ 3 ساعات",
    isRead: true,
    priority: "urgent",
    action: "مراجعة المصاريف",
    category: "maintenance"
  },
  {
    id: 5,
    type: "warning",
    title: "رصيد عامل مستحق",
    message: "العامل محمد أحمد لديه رصيد مستحق 200 شيكل",
    timestamp: "أمس",
    isRead: true,
    priority: "medium",
    action: "دفع الرصيد",
    category: "workers"
  }
]

const systemAlerts = [
  {
    id: 1,
    title: "تحديث النظام متوفر",
    message: "الإصدار 2.1.3 متوفر الآن مع تحسينات في الأداء",
    type: "system",
    timestamp: "منذ يوم",
    isRead: false
  },
  {
    id: 2,
    title: "نسخة احتياطية مجدولة",
    message: "سيتم أخذ نسخة احتياطية في الساعة 2:00 ص",
    type: "system",
    timestamp: "منذ يومين",
    isRead: true
  }
]

const reports = [
  {
    id: 1,
    title: "تقرير الإنتاج الأسبوعي جاهز",
    message: "تقرير الأسبوع الحالي",
    type: "report",
    timestamp: "منذ يوم",
    isRead: false,
    downloadUrl: "/reports/weekly-production.pdf"
  },
  {
    id: 2,
    title: "تقرير المبيعات الشهري",
    message: "تقرير الشهر الحالي",
    type: "report",
    timestamp: "منذ 3 أيام",
    isRead: true,
    downloadUrl: "/reports/monthly-sales.pdf"
  }
]

function getNotificationIcon(type: string) {
  switch (type) {
    case "success": return <CheckCircle className="h-5 w-5 text-green-500" />
    case "warning": return <AlertTriangle className="h-5 w-5 text-yellow-500" />
    case "error": return <AlertTriangle className="h-5 w-5 text-red-500" />
    case "info": return <Info className="h-5 w-5 text-blue-500" />
    default: return <Bell className="h-5 w-5 text-muted-foreground" />
  }
}

function getPriorityColor(priority: string) {
  switch (priority) {
    case "urgent": return "destructive"
    case "high": return "default"
    case "medium": return "secondary"
    case "low": return "outline"
    default: return "secondary"
  }
}

function getPriorityText(priority: string) {
  switch (priority) {
    case "urgent": return "عاجل"
    case "high": return "مرتفع"
    case "medium": return "متوسط"
    case "low": return "منخفض"
    default: return "متوسط"
  }
}

function getCategoryText(category: string) {
  switch (category) {
    case "inventory": return "المخزون"
    case "production": return "الإنتاج"
    case "orders": return "الطابور"
    case "maintenance": return "المصاريف"
    case "workers": return "العمال"
    case "quality": return "الجودة"
    default: return category
  }
}

export default function Notifications() {
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("all")
  const [showUnreadOnly, setShowUnreadOnly] = useState(false)

  const filteredNotifications = notifications.filter(notification => {
    const matchesSearch = notification.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         notification.message.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesCategory = selectedCategory === "all" || notification.category === selectedCategory
    const matchesRead = !showUnreadOnly || !notification.isRead
    return matchesSearch && matchesCategory && matchesRead
  })

  const unreadCount = notifications.filter(n => !n.isRead).length

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6" dir="rtl">
      <div className="flex items-center justify-between space-y-2">
        <div className="flex items-center gap-3">
          <h2 className="text-3xl font-bold tracking-tight">الإشعارات</h2>
          {unreadCount > 0 && (
            <Badge variant="destructive" className="animate-pulse">
              {unreadCount} جديد
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline">
            <Settings className="ml-2 h-4 w-4" />
            إعدادات الإشعارات
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline">
                <CheckCircle className="ml-2 h-4 w-4" />
                تحديد الكل كمقروء
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>تحديد جميع الإشعارات كمقروءة؟</AlertDialogTitle>
                <AlertDialogDescription>
                  سيتم تحديد جميع الإشعارات الحالية كمقروءة. هل تريد المتابعة؟
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>إلغاء</AlertDialogCancel>
                <AlertDialogAction>تأكيد</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <Tabs defaultValue="all" className="space-y-4">
        <TabsList>
          <TabsTrigger value="all">جميع الإشعارات</TabsTrigger>
          <TabsTrigger value="system">إشعارات النظام</TabsTrigger>
          <TabsTrigger value="reports">التقارير</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute right-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="البحث في الإشعارات..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pr-8"
              />
            </div>
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-[180px]">
                <Filter className="h-4 w-4 ml-2" />
                <SelectValue placeholder="اختر الفئة" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع الفئات</SelectItem>
                <SelectItem value="inventory">المخزون</SelectItem>
                <SelectItem value="production">الإنتاج</SelectItem>
                <SelectItem value="orders">الطابور</SelectItem>
                <SelectItem value="maintenance">المصاريف</SelectItem>
                <SelectItem value="workers">العمال</SelectItem>
              </SelectContent>
            </Select>
            <Button 
              variant={showUnreadOnly ? "default" : "outline"}
              onClick={() => setShowUnreadOnly(!showUnreadOnly)}
            >
              {showUnreadOnly ? <Bell className="h-4 w-4 ml-1" /> : <BellOff className="h-4 w-4 ml-1" />}
              غير مقروء فقط
            </Button>
          </div>

          <div className="space-y-3">
            {filteredNotifications.map((notification) => (
              <Card 
                key={notification.id} 
                className={`shadow-soft transition-smooth hover:shadow-olive ${
                  !notification.isRead ? 'border-r-4 border-r-primary bg-primary/5' : ''
                }`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1">
                      {getNotificationIcon(notification.type)}
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2">
                          <h3 className={`font-medium ${!notification.isRead ? 'font-semibold' : ''}`}>
                            {notification.title}
                          </h3>
                          {!notification.isRead && (
                            <div className="w-2 h-2 bg-primary rounded-full" />
                          )}
                          <Badge variant={getPriorityColor(notification.priority) as any} className="text-xs">
                            {getPriorityText(notification.priority)}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {notification.message}
                        </p>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span>{notification.timestamp}</span>
                          <Badge variant="outline" className="text-xs">
                            {getCategoryText(notification.category)}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm">
                        {notification.action}
                      </Button>
                      <Button variant="ghost" size="sm">
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {filteredNotifications.length === 0 && (
            <Card className="shadow-soft">
              <CardContent className="p-8 text-center">
                <Bell className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">لا توجد إشعارات</h3>
                <p className="text-muted-foreground">
                  {showUnreadOnly ? "جميع الإشعارات مقروءة" : "لا توجد إشعارات تطابق معايير البحث"}
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="system" className="space-y-4">
          <Card className="shadow-soft transition-smooth hover:shadow-olive">
            <CardHeader>
              <CardTitle>إشعارات النظام</CardTitle>
              <CardDescription>
                تحديثات النظام والصيانة المجدولة
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {systemAlerts.map((alert) => (
                <div key={alert.id} className="flex items-start gap-3 p-3 border rounded-lg">
                  <Info className="h-5 w-5 text-blue-500 mt-0.5" />
                  <div className="flex-1">
                    <h4 className={`font-medium ${!alert.isRead ? 'font-semibold' : ''}`}>
                      {alert.title}
                      {!alert.isRead && <span className="w-2 h-2 bg-primary rounded-full inline-block mr-2" />}
                    </h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      {alert.message}
                    </p>
                    <p className="text-xs text-muted-foreground mt-2">
                      {alert.timestamp}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reports" className="space-y-4">
          <Card className="shadow-soft transition-smooth hover:shadow-olive">
            <CardHeader>
              <CardTitle>التقارير الجاهزة</CardTitle>
              <CardDescription>
                التقارير المكتملة والجاهزة للتحميل
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {reports.map((report) => (
                <div key={report.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-start gap-3">
                    <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
                    <div>
                      <h4 className={`font-medium ${!report.isRead ? 'font-semibold' : ''}`}>
                        {report.title}
                        {!report.isRead && <span className="w-2 h-2 bg-primary rounded-full inline-block mr-2" />}
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        {report.message}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {report.timestamp}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm">
                      تحميل PDF
                    </Button>
                    <Button variant="ghost" size="sm">
                      <Archive className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}