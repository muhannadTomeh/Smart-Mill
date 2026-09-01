import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Plus, Search, Filter, Phone, Mail, MapPin, Building, Star, TrendingUp, DollarSign, Package } from "lucide-react"
import { useState } from "react"

// البيانات الوهمية للعملاء
const customers = [
  {
    id: 1,
    name: "شركة الأردن للتجارة",
    type: "شركة",
    email: "info@jordan-trade.com",
    phone: "+970-123-456789",
    address: "رام الله، فلسطين",
    totalOrders: 45,
    totalSpent: 234500,
    lastOrder: "2024-01-15",
    status: "نشط",
    rating: 5,
    contactPerson: "أحمد محمود",
    notes: "عميل مميز، دفع سريع"
  },
  {
    id: 2,
    name: "مؤسسة النور التجارية",
    type: "مؤسسة",
    email: "orders@alnoor.ps",
    phone: "+970-987-654321",
    address: "نابلس، فلسطين",
    totalOrders: 38,
    totalSpent: 189200,
    lastOrder: "2024-01-12",
    status: "نشط",
    rating: 4,
    contactPerson: "فاطمة أحمد",
    notes: "يفضل التسليم صباحاً"
  },
  {
    id: 3,
    name: "شركة البركة للأغذية",
    type: "شركة",
    email: "purchasing@baraka.com",
    phone: "+970-555-123456",
    address: "الخليل، فلسطين",
    totalOrders: 32,
    totalSpent: 156800,
    lastOrder: "2024-01-10",
    status: "متوقف",
    rating: 3,
    contactPerson: "محمد عبدالله",
    notes: "عميل موسمي"
  }
]

// البيانات الوهمية للموردين
const suppliers = [
  {
    id: 1,
    name: "مزارع الزيتون الفلسطينية",
    type: "مورد أساسي",
    email: "supply@olive-farms.ps",
    phone: "+970-234-567890",
    address: "جنين، فلسطين",
    products: ["زيتون بري", "زيتون نبالي"],
    totalSupplied: 125000,
    lastDelivery: "2024-01-14",
    status: "نشط",
    rating: 5,
    contactPerson: "يوسف السالم",
    paymentTerms: "30 يوم"
  },
  {
    id: 2,
    name: "شركة العبوات الحديثة",
    type: "مورد تعبئة",
    email: "sales@modern-packaging.com",
    phone: "+970-345-678901",
    address: "طولكرم، فلسطين",
    products: ["عبوات زجاجية", "ملصقات"],
    totalSupplied: 45000,
    lastDelivery: "2024-01-13",
    status: "نشط",
    rating: 4,
    contactPerson: "سامر قاسم",
    paymentTerms: "15 يوم"
  },
  {
    id: 3,
    name: "مؤسسة الخدمات اللوجستية",
    type: "خدمات",
    email: "logistics@transport.ps",
    phone: "+970-456-789012",
    address: "بيت لحم، فلسطين",
    products: ["نقل", "تخزين"],
    totalSupplied: 28000,
    lastDelivery: "2024-01-11",
    status: "نشط",
    rating: 4,
    contactPerson: "علي حسن",
    paymentTerms: "فوري"
  }
]

function getStatusColor(status: string) {
  switch (status) {
    case 'نشط': return 'default'
    case 'متوقف': return 'secondary'
    case 'معلق': return 'destructive'
    default: return 'secondary'
  }
}

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').substring(0, 2)
}

function renderStars(rating: number) {
  return Array.from({ length: 5 }, (_, i) => (
    <Star 
      key={i} 
      className={`h-4 w-4 ${i < rating ? 'text-yellow-400 fill-current' : 'text-gray-300'}`} 
    />
  ))
}

export default function Contacts() {
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedType, setSelectedType] = useState("all")

  const filteredCustomers = customers.filter(customer => {
    const matchesSearch = customer.name.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesType = selectedType === "all" || customer.type === selectedType
    return matchesSearch && matchesType
  })

  const filteredSuppliers = suppliers.filter(supplier => {
    const matchesSearch = supplier.name.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesType = selectedType === "all" || supplier.type === selectedType
    return matchesSearch && matchesType
  })

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">العملاء والموردين</h2>
        <div className="flex items-center space-x-2 space-x-reverse">
          <Dialog>
            <DialogTrigger asChild>
              <Button className="shadow-soft transition-smooth hover:shadow-olive">
                <Plus className="ml-2 h-4 w-4" />
                إضافة جهة اتصال
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>إضافة جهة اتصال جديدة</DialogTitle>
                <DialogDescription>
                  أدخل تفاصيل العميل أو المورد الجديد
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="contactType">نوع الجهة</Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="اختر النوع" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="customer">عميل</SelectItem>
                        <SelectItem value="supplier">مورد</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="contactCategory">الفئة</Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="اختر الفئة" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="company">شركة</SelectItem>
                        <SelectItem value="individual">فرد</SelectItem>
                        <SelectItem value="institution">مؤسسة</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="name">الاسم</Label>
                  <Input id="name" placeholder="اسم الشركة أو الشخص" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">البريد الإلكتروني</Label>
                    <Input id="email" type="email" placeholder="email@example.com" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">رقم الهاتف</Label>
                    <Input id="phone" placeholder="+970-123-456789" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="address">العنوان</Label>
                  <Input id="address" placeholder="العنوان الكامل" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contactPerson">الشخص المسؤول</Label>
                  <Input id="contactPerson" placeholder="اسم الشخص المسؤول" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notes">ملاحظات</Label>
                  <Textarea id="notes" placeholder="ملاحظات إضافية..." />
                </div>
              </div>
              <Button className="w-full">إضافة جهة الاتصال</Button>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Tabs defaultValue="customers" className="space-y-4">
        <TabsList>
          <TabsTrigger value="customers">العملاء</TabsTrigger>
          <TabsTrigger value="suppliers">الموردين</TabsTrigger>
          <TabsTrigger value="analytics">التحليلات</TabsTrigger>
        </TabsList>

        <TabsContent value="customers" className="space-y-4">
          <div className="flex items-center space-x-2 space-x-reverse">
            <div className="relative flex-1">
              <Search className="absolute right-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="البحث في العملاء..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pr-8"
              />
            </div>
            <Select value={selectedType} onValueChange={setSelectedType}>
              <SelectTrigger className="w-[180px]">
                <Filter className="h-4 w-4 ml-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع الأنواع</SelectItem>
                <SelectItem value="شركة">شركة</SelectItem>
                <SelectItem value="مؤسسة">مؤسسة</SelectItem>
                <SelectItem value="فرد">فرد</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredCustomers.map((customer) => (
              <Card key={customer.id} className="shadow-soft transition-smooth hover:shadow-olive">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-3 space-x-reverse">
                      <Avatar>
                        <AvatarFallback className="bg-primary text-primary-foreground">
                          {getInitials(customer.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <CardTitle className="text-lg">{customer.name}</CardTitle>
                        <CardDescription>{customer.type}</CardDescription>
                      </div>
                    </div>
                    <Badge variant={getStatusColor(customer.status) as any}>
                      {customer.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <span>{customer.phone}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <span className="truncate">{customer.email}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      <span>{customer.address}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Building className="h-4 w-4 text-muted-foreground" />
                      <span>{customer.contactPerson}</span>
                    </div>
                  </div>

                  <div className="pt-4 border-t space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">إجمالي الطلبات:</span>
                      <span className="font-medium">{customer.totalOrders}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">إجمالي المبلغ:</span>
                      <span className="font-medium">₪ {customer.totalSpent.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">آخر طلب:</span>
                      <span className="font-medium">{customer.lastOrder}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">التقييم:</span>
                      <div className="flex">
                        {renderStars(customer.rating)}
                      </div>
                    </div>
                  </div>

                  {customer.notes && (
                    <div className="pt-2 border-t">
                      <p className="text-xs text-muted-foreground">{customer.notes}</p>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1">
                      عرض التفاصيل
                    </Button>
                    <Button size="sm" className="flex-1">
                      طلب جديد
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="suppliers" className="space-y-4">
          <div className="flex items-center space-x-2 space-x-reverse">
            <div className="relative flex-1">
              <Search className="absolute right-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="البحث في الموردين..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pr-8"
              />
            </div>
            <Select value={selectedType} onValueChange={setSelectedType}>
              <SelectTrigger className="w-[180px]">
                <Filter className="h-4 w-4 ml-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع الأنواع</SelectItem>
                <SelectItem value="مورد أساسي">مورد أساسي</SelectItem>
                <SelectItem value="مورد تعبئة">مورد تعبئة</SelectItem>
                <SelectItem value="خدمات">خدمات</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredSuppliers.map((supplier) => (
              <Card key={supplier.id} className="shadow-soft transition-smooth hover:shadow-olive">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-3 space-x-reverse">
                      <Avatar>
                        <AvatarFallback className="bg-secondary text-secondary-foreground">
                          {getInitials(supplier.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <CardTitle className="text-lg">{supplier.name}</CardTitle>
                        <CardDescription>{supplier.type}</CardDescription>
                      </div>
                    </div>
                    <Badge variant={getStatusColor(supplier.status) as any}>
                      {supplier.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <span>{supplier.phone}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <span className="truncate">{supplier.email}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      <span>{supplier.address}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Building className="h-4 w-4 text-muted-foreground" />
                      <span>{supplier.contactPerson}</span>
                    </div>
                  </div>

                  <div className="pt-4 border-t space-y-2">
                    <div className="flex flex-wrap gap-1">
                      {supplier.products.map((product, index) => (
                        <Badge key={index} variant="outline" className="text-xs">
                          {product}
                        </Badge>
                      ))}
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">إجمالي التوريد:</span>
                      <span className="font-medium">₪ {supplier.totalSupplied.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">آخر توريد:</span>
                      <span className="font-medium">{supplier.lastDelivery}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">شروط الدفع:</span>
                      <span className="font-medium">{supplier.paymentTerms}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">التقييم:</span>
                      <div className="flex">
                        {renderStars(supplier.rating)}
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1">
                      عرض التفاصيل
                    </Button>
                    <Button size="sm" className="flex-1">
                      طلب شراء
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card className="shadow-soft transition-smooth hover:shadow-olive">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">إجمالي العملاء</CardTitle>
                <Building className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{customers.length}</div>
                <p className="text-xs text-muted-foreground flex items-center">
                  <TrendingUp className="h-3 w-3 text-green-500 ml-1" />
                  +2 هذا الشهر
                </p>
              </CardContent>
            </Card>
            <Card className="shadow-soft transition-smooth hover:shadow-olive">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">إجمالي الموردين</CardTitle>
                <Package className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{suppliers.length}</div>
                <p className="text-xs text-muted-foreground flex items-center">
                  <TrendingUp className="h-3 w-3 text-green-500 ml-1" />
                  +1 هذا الشهر
                </p>
              </CardContent>
            </Card>
            <Card className="shadow-soft transition-smooth hover:shadow-olive">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">متوسط قيمة العميل</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">₪ {Math.round(customers.reduce((acc, c) => acc + c.totalSpent, 0) / customers.length).toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">
                  لكل عميل
                </p>
              </CardContent>
            </Card>
            <Card className="shadow-soft transition-smooth hover:shadow-olive">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">العملاء النشطون</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{customers.filter(c => c.status === 'نشط').length}</div>
                <p className="text-xs text-muted-foreground">
                  من أصل {customers.length} عميل
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card className="shadow-soft transition-smooth hover:shadow-olive">
              <CardHeader>
                <CardTitle>أفضل العملاء</CardTitle>
                <CardDescription>حسب إجمالي المبيعات</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {customers
                    .sort((a, b) => b.totalSpent - a.totalSpent)
                    .slice(0, 5)
                    .map((customer, index) => (
                      <div key={customer.id} className="flex items-center gap-3">
                        <div className="text-sm font-medium text-muted-foreground w-6">
                          #{index + 1}
                        </div>
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs">
                            {getInitials(customer.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{customer.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {customer.totalOrders} طلبات
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium">₪ {customer.totalSpent.toLocaleString()}</p>
                        </div>
                      </div>
                    ))
                  }
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-soft transition-smooth hover:shadow-olive">
              <CardHeader>
                <CardTitle>أفضل الموردين</CardTitle>
                <CardDescription>حسب حجم التوريد</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {suppliers
                    .sort((a, b) => b.totalSupplied - a.totalSupplied)
                    .map((supplier, index) => (
                      <div key={supplier.id} className="flex items-center gap-3">
                        <div className="text-sm font-medium text-muted-foreground w-6">
                          #{index + 1}
                        </div>
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs">
                            {getInitials(supplier.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{supplier.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {supplier.type}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium">₪ {supplier.totalSupplied.toLocaleString()}</p>
                        </div>
                      </div>
                    ))
                  }
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}