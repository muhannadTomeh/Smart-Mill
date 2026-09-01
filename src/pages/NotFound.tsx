import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { Home, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname
    );
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background" dir="rtl">
      <div className="text-center space-y-6">
        <AlertTriangle className="h-24 w-24 text-primary mx-auto" />
        <h1 className="text-6xl font-bold text-primary">404</h1>
        <p className="text-xl text-muted-foreground">عذراً! الصفحة غير موجودة</p>
        <p className="text-sm text-muted-foreground">
          الصفحة التي تبحث عنها غير متوفرة أو تم نقلها
        </p>
        <Button asChild>
          <Link to="/">
            <Home className="h-4 w-4 ml-2" />
            العودة للرئيسية
          </Link>
        </Button>
      </div>
    </div>
  );
};

export default NotFound;