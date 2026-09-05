import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calculator as CalcIcon, Delete, ArrowDownToLine } from "lucide-react";

interface SimpleCalculatorProps {
  onUseValue?: (value: number) => void;
}

export function SimpleCalculator({ onUseValue }: SimpleCalculatorProps) {
  const [display, setDisplay] = useState("0");
  const [expression, setExpression] = useState("");
  const [prevVal, setPrevVal] = useState<number | null>(null);
  const [operation, setOperation] = useState<string | null>(null);
  const [overwrite, setOverwrite] = useState(false);

  const handleDigit = (digit: string) => {
    if (overwrite || display === "0") {
      setDisplay(digit);
      setOverwrite(false);
    } else {
      if (display.length < 12) {
        setDisplay(display + digit);
      }
    }
  };

  const handleDecimal = () => {
    if (overwrite) {
      setDisplay("0.");
      setOverwrite(false);
      return;
    }
    if (!display.includes(".")) {
      setDisplay(display + ".");
    }
  };

  const handleClear = () => {
    setDisplay("0");
    setExpression("");
    setPrevVal(null);
    setOperation(null);
    setOverwrite(false);
  };

  const handleBackspace = () => {
    if (overwrite) return;
    if (display.length <= 1) {
      setDisplay("0");
    } else {
      setDisplay(display.slice(0, -1));
    }
  };

  const calculate = (a: number, b: number, op: string): number => {
    switch (op) {
      case "+": return a + b;
      case "-": return a - b;
      case "×":
      case "*": return a * b;
      case "÷":
      case "/": return b !== 0 ? a / b : 0;
      default: return b;
    }
  };

  const handleOperator = (op: string) => {
    const current = parseFloat(display);
    if (prevVal === null) {
      setPrevVal(current);
      setExpression(`${current} ${op}`);
    } else if (operation) {
      const result = calculate(prevVal, current, operation);
      const rounded = Math.round(result * 1000) / 1000;
      setPrevVal(rounded);
      setDisplay(String(rounded));
      setExpression(`${rounded} ${op}`);
    }
    setOperation(op);
    setOverwrite(true);
  };

  const handleEquals = () => {
    if (prevVal === null || !operation) return;
    const current = parseFloat(display);
    const result = calculate(prevVal, current, operation);
    const rounded = Math.round(result * 1000) / 1000;
    setExpression(`${prevVal} ${operation} ${current} =`);
    setDisplay(String(rounded));
    setPrevVal(null);
    setOperation(null);
    setOverwrite(true);
  };

  const handleToggleSign = () => {
    const val = parseFloat(display);
    if (val !== 0) {
      setDisplay(String(-val));
    }
  };

  const handlePercent = () => {
    const val = parseFloat(display);
    const result = val / 100;
    setDisplay(String(result));
  };

  // Keyboard support when focused on window
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept when user is typing in an input field
      const target = e.target as HTMLElement;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }

      if (/^[0-9]$/.test(e.key)) {
        handleDigit(e.key);
      } else if (e.key === ".") {
        handleDecimal();
      } else if (e.key === "+") {
        handleOperator("+");
      } else if (e.key === "-") {
        handleOperator("-");
      } else if (e.key === "*") {
        handleOperator("×");
      } else if (e.key === "/") {
        e.preventDefault();
        handleOperator("÷");
      } else if (e.key === "Enter" || e.key === "=") {
        e.preventDefault();
        handleEquals();
      } else if (e.key === "Backspace") {
        handleBackspace();
      } else if (e.key === "Escape") {
        handleClear();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [display, prevVal, operation, overwrite]);

  const currentNumber = parseFloat(display) || 0;

  return (
    <Card className="h-full flex flex-col border-primary/20 shadow-sm bg-card">
      <CardHeader className="pb-3 border-b bg-muted/20">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-bold flex items-center gap-2 text-foreground">
            <CalcIcon className="h-5 w-5 text-primary" />
            <span>آلة حاسبة سريعة</span>
          </CardTitle>
          <span className="text-[11px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full font-mono">
            حسابات فورية
          </span>
        </div>
        <CardDescription className="text-xs">
          لحساب أوزان الشوالات أو جمع الحسابات وتصدير الناتج مباشرة للفاتورة
        </CardDescription>
      </CardHeader>

      <CardContent className="p-4 space-y-4 flex-1 flex flex-col justify-between">
        {/* Screen / Display */}
        <div className="bg-muted/60 dark:bg-muted/30 border rounded-xl p-3 text-left space-y-1">
          <div className="text-xs text-muted-foreground font-mono h-4 overflow-hidden text-ellipsis">
            {expression || " "}
          </div>
          <div className="text-3xl font-mono font-bold tracking-tight text-foreground select-all overflow-x-auto">
            {display}
          </div>
        </div>

        {/* Buttons Pad */}
        <div className="grid grid-cols-4 gap-2 flex-1">
          {/* Row 1 */}
          <Button
            type="button"
            variant="outline"
            onClick={handleClear}
            className="h-11 text-sm font-bold text-destructive hover:bg-destructive/10"
          >
            C
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleBackspace}
            className="h-11 text-sm font-medium"
            title="حذف خانة"
          >
            <Delete className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handlePercent}
            className="h-11 text-sm font-medium"
          >
            %
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => handleOperator("÷")}
            className="h-11 text-base font-bold text-primary bg-primary/10 hover:bg-primary/20"
          >
            ÷
          </Button>

          {/* Row 2 */}
          <Button
            type="button"
            variant="outline"
            onClick={() => handleDigit("7")}
            className="h-11 text-lg font-semibold"
          >
            7
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleDigit("8")}
            className="h-11 text-lg font-semibold"
          >
            8
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleDigit("9")}
            className="h-11 text-lg font-semibold"
          >
            9
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => handleOperator("×")}
            className="h-11 text-base font-bold text-primary bg-primary/10 hover:bg-primary/20"
          >
            ×
          </Button>

          {/* Row 3 */}
          <Button
            type="button"
            variant="outline"
            onClick={() => handleDigit("4")}
            className="h-11 text-lg font-semibold"
          >
            4
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleDigit("5")}
            className="h-11 text-lg font-semibold"
          >
            5
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleDigit("6")}
            className="h-11 text-lg font-semibold"
          >
            6
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => handleOperator("-")}
            className="h-11 text-lg font-bold text-primary bg-primary/10 hover:bg-primary/20"
          >
            -
          </Button>

          {/* Row 4 */}
          <Button
            type="button"
            variant="outline"
            onClick={() => handleDigit("1")}
            className="h-11 text-lg font-semibold"
          >
            1
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleDigit("2")}
            className="h-11 text-lg font-semibold"
          >
            2
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleDigit("3")}
            className="h-11 text-lg font-semibold"
          >
            3
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => handleOperator("+")}
            className="h-11 text-lg font-bold text-primary bg-primary/10 hover:bg-primary/20"
          >
            +
          </Button>

          {/* Row 5 */}
          <Button
            type="button"
            variant="outline"
            onClick={handleToggleSign}
            className="h-11 text-sm font-medium"
          >
            ±
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleDigit("0")}
            className="h-11 text-lg font-semibold"
          >
            0
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleDecimal}
            className="h-11 text-lg font-bold"
          >
            .
          </Button>
          <Button
            type="button"
            onClick={handleEquals}
            className="h-11 text-lg font-bold bg-primary text-primary-foreground shadow-sm"
          >
            =
          </Button>
        </div>

        {/* Action: Use result as Oil quantity */}
        {onUseValue && (
          <Button
            type="button"
            variant="outline"
            onClick={() => onUseValue(currentNumber)}
            disabled={currentNumber <= 0}
            className="w-full h-11 border-primary/30 text-primary hover:bg-primary/5 font-semibold text-xs gap-2"
          >
            <ArrowDownToLine className="h-4 w-4" />
            <span>نقل الناتج ({currentNumber}) إلى كمية الزيت بالفاتورة</span>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
