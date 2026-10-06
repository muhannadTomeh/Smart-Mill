import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface HistoryPaginationProps {
  page: number;
  pageSize: number;
  totalCount: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}

export function HistoryPagination({
  page,
  pageSize,
  totalCount,
  onPageChange,
  onPageSizeChange,
}: HistoryPaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const firstRow = totalCount === 0 ? 0 : page * pageSize + 1;
  const lastRow = Math.min((page + 1) * pageSize, totalCount);

  return (
    <div className="flex flex-col gap-3 border-t bg-muted/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between" dir="rtl">
      <p className="text-xs text-muted-foreground">
        عرض <span className="font-bold text-foreground">{firstRow.toLocaleString("ar-u-nu-latn")}–{lastRow.toLocaleString("ar-u-nu-latn")}</span>
        {" "}من <span className="font-bold text-foreground">{totalCount.toLocaleString("ar-u-nu-latn")}</span> نتيجة
      </p>

      <div className="flex items-center justify-between gap-2 sm:justify-end">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">صفوف الصفحة</span>
          <Select
            value={String(pageSize)}
            onValueChange={(value) => onPageSizeChange(Number(value))}
          >
            <SelectTrigger className="h-8 w-20 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent dir="rtl">
              <SelectItem value="10">10</SelectItem>
              <SelectItem value="25">25</SelectItem>
              <SelectItem value="50">50</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={page === 0 || totalCount === 0}
            onClick={() => onPageChange(Math.max(0, page - 1))}
            aria-label="الصفحة السابقة"
            title="الصفحة السابقة"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="min-w-20 text-center text-xs font-medium">
            {totalCount === 0 ? 0 : page + 1} / {totalCount === 0 ? 0 : totalPages}
          </span>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={totalCount === 0 || page >= totalPages - 1}
            onClick={() => onPageChange(Math.min(totalPages - 1, page + 1))}
            aria-label="الصفحة التالية"
            title="الصفحة التالية"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
