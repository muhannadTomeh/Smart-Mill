type ErrorLike = {
  code?: unknown;
  message?: unknown;
  details?: unknown;
  hint?: unknown;
  error?: unknown;
};

const ERROR_MESSAGES: Record<string, string> = {
  AUTHENTICATION_REQUIRED: "انتهت جلسة الدخول. سجّل الدخول مجددًا ثم حاول مرة أخرى.",
  PLATFORM_ADMIN_REQUIRED: "هذه العملية متاحة لمشرف النظام العام فقط.",
  INVALID_SUBSCRIPTION_TYPE: "اختر نوع الاشتراك: شهري أو موسمي.",
  INVALID_SUBSCRIPTION_FEE: "أدخل قيمة اشتراك صحيحة تساوي صفرًا أو أكثر.",
  INVALID_SUBSCRIPTION_PAYMENT_AMOUNT: "مبلغ دفعة الاشتراك يجب أن يكون أكبر من صفر.",
  SUBSCRIPTION_PAYMENT_DATE_REQUIRED: "اختر تاريخ دفعة الاشتراك.",
  SUBSCRIPTION_FIELDS_PLATFORM_ADMIN_ONLY: "إدارة نوع الاشتراك وقيمته وحالته متاحة لمشرف النظام العام فقط.",
  INVALID_NOTIFICATION_SCOPE: "اختر إرسال الإشعار إلى الجميع أو إلى مستخدم محدد.",
  NOTIFICATION_RECIPIENT_REQUIRED: "اختر المستخدم الذي تريد إرسال الإشعار إليه.",
  NOTIFICATION_RECIPIENT_NOT_FOUND: "المستخدم المحدد غير موجود أو حسابه غير نشط.",
  INVALID_NOTIFICATION_TITLE: "عنوان الإشعار مطلوب ويجب ألا يتجاوز 120 حرفًا.",
  INVALID_NOTIFICATION_MESSAGE: "نص الإشعار مطلوب ويجب ألا يتجاوز 2000 حرف.",
  INVALID_NOTIFICATION_CATEGORY: "نوع الإشعار المحدد غير صالح.",
  INVALID_NOTIFICATION_ACTION_URL: "رابط الإشعار المحدد غير صالح.",
  INVALID_ADMIN_CHARGE_TITLE: "اكتب اسمًا واضحًا للدين أو الرسم الإضافي.",
  INVALID_ADMIN_CHARGE_AMOUNT: "مبلغ الدين الإضافي يجب أن يكون أكبر من صفر.",
  INVALID_ADMIN_CHARGE_NOTES: "ملاحظات الدين طويلة جدًا. اختصرها ثم حاول مرة أخرى.",
  INVALID_ADMIN_CHARGE_STATUS: "حالة الدين المحددة غير صالحة.",
  ADMIN_CHARGE_NOT_FOUND: "الدين الإداري المطلوب غير موجود.",
  ADMIN_CHARGE_ALREADY_CLOSED: "تم إغلاق هذا الدين مسبقًا ولا يمكن تغيير حالته مرة أخرى.",
  INVALID_ADMIN_CHARGE_PAYMENT_AMOUNT: "مبلغ دفعة الدين يجب أن يكون أكبر من صفر.",
  ADMIN_CHARGE_PAYMENT_DATE_REQUIRED: "اختر تاريخ دفعة الدين.",
  ADMIN_CHARGE_PAYMENT_EXCEEDS_REMAINING: "مبلغ الدفعة أكبر من الرصيد المتبقي على الدين.",
  ADMIN_CHARGE_PAYMENT_ALREADY_REVERSED: "تم عكس دفعة هذا الدين مسبقًا.",
  ADMIN_CHARGE_PAYMENT_REQUIRED: "لتسجيل السداد استخدم زر «تسجيل دفعة» حتى تدخل الحركة إلى صندوق الإدارة.",
  ADMIN_CHARGE_HAS_PAYMENTS: "لا يمكن إلغاء الدين قبل عكس الدفعات المسجلة عليه.",
  INVALID_PLATFORM_CASH_DIRECTION: "نوع حركة صندوق الإدارة غير صالح.",
  INVALID_PLATFORM_CASH_AMOUNT: "مبلغ حركة صندوق الإدارة يجب أن يكون أكبر من صفر.",
  PLATFORM_CASH_DESCRIPTION_REQUIRED: "اكتب بيانًا واضحًا لحركة صندوق الإدارة.",
  PLATFORM_CASH_INPUT_REQUIRED: "أكمل تاريخ وبيانات حركة صندوق الإدارة.",
  INSUFFICIENT_PLATFORM_CASH: "رصيد صندوق إدارة المنصة غير كافٍ لتسجيل هذا المصروف.",
  PLATFORM_REVERSAL_REASON_REQUIRED: "اكتب سببًا واضحًا لعكس الحركة المالية.",
  PLATFORM_TRANSACTION_NOT_FOUND: "حركة صندوق الإدارة المطلوبة غير موجودة.",
  PLATFORM_REVERSAL_OF_REVERSAL_FORBIDDEN: "لا يمكن عكس حركة تصحيح مرة أخرى.",
  PLATFORM_TRANSACTION_ALREADY_REVERSED: "تم عكس هذه الحركة المالية مسبقًا.",
  INSUFFICIENT_PLATFORM_CASH_FOR_REVERSAL: "رصيد صندوق الإدارة لا يكفي لعكس هذه الحركة الداخلة.",
  SUBSCRIPTION_PAYMENT_ALREADY_REVERSED: "تم عكس دفعة الاشتراك مسبقًا.",
  IDEMPOTENCY_KEY_CONFLICT: "تعذر تثبيت الدفعة بأمان. أغلق النافذة وافتحها ثم حاول مرة أخرى.",
  MILL_OWNER_REQUIRED: "هذه العملية متاحة لمالك المعصرة فقط.",
  TENANT_ACCESS_DENIED: "لا يمكنك الوصول إلى بيانات معصرة أخرى.",
  TENANT_CONTEXT_MISMATCH: "البيانات المحددة لا تتبع للمعصرة الحالية.",
  INVALID_ADMIN_PIN: "رمز PIN الخاص بلوحة الإدارة غير صحيح.",
  SEASON_NOT_FOUND: "الموسم المحدد غير موجود أو لم يعد متاحًا.",
  SEASON_MILL_MISMATCH: "الموسم المحدد لا يتبع لهذه المعصرة.",
  PRODUCT_NOT_FOUND: "الصنف المحدد غير موجود أو تمت أرشفته.",
  PRODUCT_MILL_MISMATCH: "الصنف المحدد لا يتبع لهذه المعصرة.",
  INSUFFICIENT_PRODUCT_STOCK: "مخزون التنك أو الصنف المحدد غير كافٍ لإتمام العملية.",
  INSUFFICIENT_STOCK_FOR_CANCELLATION: "لا يمكن الإلغاء لأن المخزون الحالي لا يكفي لعكس العملية.",
  PRODUCT_STOCK_MOVEMENT_QUANTITY_INVALID: "كمية حركة المخزون غير صحيحة.",
  PRODUCT_STOCK_ADJUSTMENT_INVALID: "أدخل كمية صحيحة غير صفرية لتعديل المخزون.",
  PRODUCT_STOCK_ADJUSTMENT_FORBIDDEN: "تعديل المخزون متاح لمالك المعصرة فقط.",
  PRODUCT_INVOICE_AVAILABILITY_FORBIDDEN: "إضافة الأصناف إلى الفاتورة أو إخفاؤها متاحة لمالك المعصرة فقط.",
  PRODUCT_PURCHASE_INVALID: "تأكد من أن الكمية وسعر شراء الوحدة أكبر من صفر.",
  PRODUCT_PURCHASE_FORBIDDEN: "شراء البضاعة متاح لمالك المعصرة فقط.",
  PRODUCT_PURCHASE_NOT_FOUND: "عملية شراء البضاعة غير موجودة.",
  PRODUCT_PURCHASE_ALREADY_CANCELLED: "عملية شراء البضاعة ملغاة بالفعل.",
  PRODUCT_SALE_INVALID_QUANTITY: "أدخل كمية بيع صحيحة أكبر من صفر.",
  PRODUCT_SALE_INVALID_PRICE: "أدخل سعر بيع صحيحًا أكبر من صفر.",
  PRODUCT_SALE_FORBIDDEN: "ليس لديك صلاحية بيع هذا الصنف.",
  PRODUCT_SALE_NOT_FOUND: "عملية بيع البضاعة غير موجودة.",
  PRODUCT_SALE_ALREADY_CANCELLED: "عملية بيع البضاعة ملغاة بالفعل.",
  PAYMENT_METHOD_INVALID: "طريقة الدفع المحددة غير صالحة.",
  SUPPLIER_NOT_FOUND: "المورد المحدد غير موجود أو تمت أرشفته.",
  PARTNER_REQUIRED: "يرجى اختيار شريك مسجل لإتمام العملية.",
  PARTNER_NOT_FOUND: "الشريك المحدد غير موجود في هذه المعصرة.",
  PARTNER_NOT_IN_MILL: "الشريك المحدد لا يتبع لهذه المعصرة.",
  PARTNER_TRANSACTION_NOT_REVERSIBLE: "لا يمكن عكس حركة الشريك المحددة.",
  PARTNER_TRANSACTION_ALREADY_REVERSED: "تم عكس حركة الشريك مسبقًا.",
  DEPENDENT_SETTLEMENT_EXISTS: "اعكس الدفعات المرتبطة أولًا، ثم ألغِ العملية الأصلية.",
  CANCELLATION_REASON_REQUIRED: "سبب الإلغاء مطلوب.",
  REVERSAL_REASON_REQUIRED: "سبب عكس الحركة مطلوب.",
  INVOICE_INVALID: "بيانات الفاتورة غير مكتملة أو غير صحيحة.",
  INVOICE_PRODUCT_LINES_INVALID: "بيانات التنكات أو الأصناف في الفاتورة غير صحيحة.",
  INVOICE_PRODUCT_LINES_MISMATCH: "عدد التنكات لا يطابق تفاصيل الأصناف المختارة.",
  INVOICE_NOT_CANCELLABLE: "لا يمكن إلغاء هذه الفاتورة أو أنها ملغاة مسبقًا.",
  INVOICE_HAS_COLLECTIONS_REVERSE_COLLECTIONS_FIRST: "اعكس تحصيلات الفاتورة أولًا ثم ألغِ الفاتورة.",
  INVOICE_RECEIVABLE_NOT_AVAILABLE: "لا توجد ذمة قابلة للتحصيل لهذه الفاتورة.",
  COLLECTION_AMOUNT_INVALID: "مبلغ التحصيل غير صحيح.",
  COLLECTION_EXCEEDS_RECEIVABLE: "مبلغ التحصيل أكبر من الرصيد المتبقي على الزبون.",
  COLLECTION_NOT_REVERSIBLE: "لا يمكن عكس حركة التحصيل المحددة.",
  COLLECTION_ALREADY_REVERSED: "تم عكس حركة التحصيل مسبقًا.",
  COLLECTION_FORBIDDEN: "ليس لديك صلاحية تسجيل تحصيل من ذمم الزبائن.",
  COLLECTION_REVERSE_FORBIDDEN: "ليس لديك صلاحية عكس حركة التحصيل.",
  COLLECTION_FINANCIAL_EFFECT_NOT_FOUND: "تعذر العثور على الحركة النقدية المرتبطة بالتحصيل.",
  COLLECTION_FINANCIAL_EFFECT_LINK_INVALID: "حركة التحصيل غير مرتبطة بسجلها المالي بشكل صحيح.",
  CUSTOMER_PAYMENT_INVALID: "بيانات دفعة الزبون غير صحيحة.",
  DEFERRED_INVOICE_INPUT_INVALID: "بيانات الفاتورة الآجلة غير مكتملة أو غير صحيحة.",
  RECEIVABLE_CUSTOMER_REQUIRED: "يجب اختيار زبون مسجل لإنشاء ذمة مالية.",
  EXPENSE_INPUT_INVALID: "تأكد من إدخال مبلغ وتصنيف صحيحين للمصروف.",
  EXPENSE_NOT_FOUND: "المصروف المحدد غير موجود.",
  EXPENSE_NOT_CANCELLABLE: "لا يمكن إلغاء هذا المصروف أو أنه ملغى مسبقًا.",
  EXPENSE_HAS_SETTLEMENTS_REVERSE_SETTLEMENTS_FIRST: "اعكس دفعات الالتزام المرتبطة أولًا ثم ألغِ المصروف.",
  EXPENSE_FORBIDDEN: "ليس لديك صلاحية تنفيذ هذه العملية على المصروف.",
  EXPENSE_CREATE_FORBIDDEN: "ليس لديك صلاحية تسجيل مصروف جديد.",
  EXPENSE_CANCEL_FORBIDDEN: "ليس لديك صلاحية إلغاء المصروف.",
  EXPENSE_EFFECT_NOT_FOUND: "تعذر العثور على الأثر المالي المرتبط بالمصروف.",
  EXPENSE_LEDGER_NOT_FOUND: "تعذر العثور على حركة المصروف في الدفتر المالي.",
  EXPENSE_PAYABLE_NOT_FOUND: "تعذر العثور على الالتزام المالي المرتبط بالمصروف.",
  PAYABLE_NOT_FOUND: "الالتزام المالي المحدد غير موجود.",
  SETTLEMENT_AMOUNT_INVALID: "مبلغ السداد غير صحيح أو أكبر من المبلغ المتبقي.",
  SETTLEMENT_NOT_REVERSIBLE: "لا يمكن عكس دفعة السداد المحددة.",
  SETTLEMENT_ALREADY_REVERSED: "تم عكس دفعة السداد مسبقًا.",
  PAYABLE_SETTLEMENT_INVALID: "بيانات سداد الالتزام غير صحيحة.",
  PAYABLE_SETTLEMENT_FORBIDDEN: "ليس لديك صلاحية سداد الالتزامات المالية.",
  PAYABLE_SETTLEMENT_REVERSE_FORBIDDEN: "ليس لديك صلاحية عكس دفعة السداد.",
  SETTLEMENT_FINANCIAL_EFFECT_NOT_FOUND: "تعذر العثور على الحركة النقدية المرتبطة بدفعة السداد.",
  INSUFFICIENT_CASH: "الرصيد النقدي غير كافٍ لإتمام العملية.",
  INSUFFICIENT_VAULT_CASH: "رصيد صندوق المعصرة غير كافٍ لإتمام العملية.",
  INSUFFICIENT_DRAWER_CASH: "رصيد الجارور غير كافٍ لإتمام العملية.",
  OPEN_DRAWER_SESSION_REQUIRED: "يجب فتح جلسة الجارور أولًا.",
  CASH_SESSION_REQUIRED: "يجب فتح جلسة نقدية أولًا.",
  CASH_SESSION_ALREADY_OPEN: "توجد جلسة نقدية مفتوحة بالفعل.",
  CASH_SESSION_FORBIDDEN: "ليس لديك صلاحية إدارة الجلسة النقدية.",
  DRAWER_MUST_OPEN_AT_ZERO_USE_VAULT_TRANSFER: "يبدأ الجارور برصيد صفر. افتح الجلسة ثم انقل المبلغ من صندوق المعصرة.",
  INVALID_CASH_TRANSFER: "مبلغ التحويل بين الصندوق والجارور غير صحيح.",
  INVALID_VAULT_DEPOSIT: "بيانات إيداع الصندوق غير صحيحة.",
  INVALID_VAULT_EXPENSE: "بيانات مصروف الصندوق غير صحيحة.",
  NOT_A_VAULT_EXPENSE: "هذه الحركة ليست مصروفًا مسجلًا على صندوق المعصرة.",
  VAULT_EXPENSE_USE_VAULT_REVERSAL: "اعكس مصروف الصندوق من سجل حركات الصندوق المخصص.",
  VAULT_NOT_FOUND: "تعذر العثور على صندوق المعصرة لهذا الموسم.",
  VAULT_OWNER_REQUIRED: "إدارة صندوق المعصرة متاحة لمالك المعصرة فقط.",
  DUPLICATE_OPENING_BALANCE: "تم تسجيل الرصيد النقدي الافتتاحي لهذا الموسم مسبقًا.",
  OPENING_CASH_ALREADY_RECORDED: "تم تسجيل الرصيد النقدي الافتتاحي لهذا الموسم مسبقًا.",
  OPENING_BALANCE_INVALID: "الرصيد الافتتاحي يجب أن يكون أكبر من صفر.",
  OPENING_BALANCE_FORBIDDEN: "ليس لديك صلاحية تسجيل الرصيد الافتتاحي.",
  OPENING_CASH_AMOUNT_INVALID: "مبلغ الرصيد النقدي الافتتاحي يجب أن يكون أكبر من صفر.",
  OPENING_CASH_OWNER_REQUIRED: "تسجيل الرصيد النقدي الافتتاحي متاح لمالك المعصرة فقط.",
  OIL_TRADE_INVALID: "بيانات عملية الزيت غير مكتملة أو غير صحيحة.",
  OIL_TRADE_NOT_FOUND: "عملية الزيت المحددة غير موجودة.",
  OIL_TRADE_ALREADY_CANCELLED: "عملية الزيت ملغاة بالفعل.",
  OIL_TRADE_FORBIDDEN: "ليس لديك صلاحية تسجيل عملية زيت.",
  OIL_TRADE_CANCEL_FORBIDDEN: "ليس لديك صلاحية إلغاء عملية الزيت.",
  OIL_TRADE_LEDGER_EVENT_NOT_FOUND: "تعذر العثور على الحركة المالية المرتبطة بعملية الزيت.",
  OIL_TRADE_PAYABLE_NOT_FOUND: "تعذر العثور على الالتزام المرتبط بشراء الزيت الآجل.",
  OIL_SALE_CREDIT_UNSUPPORTED: "بيع الزيت الآجل غير متاح حاليًا.",
  OIL_PURCHASE_CREDITOR_REQUIRED: "اختر الدائن أو المورد لشراء الزيت الآجل.",
  INSUFFICIENT_OIL_STOCK: "مخزون الزيت غير كافٍ لإتمام عملية البيع.",
  INSUFFICIENT_OIL_STOCK_FOR_CANCELLATION: "لا يمكن الإلغاء لأن مخزون الزيت لا يكفي لعكس العملية.",
  WORKER_NOT_FOUND: "العامل المحدد غير موجود.",
  WORKER_NOT_ACTIVE: "العامل مؤرشف ولا يمكن تسجيل حركة جديدة له.",
  WORK_VALUE_INVALID: "قيمة العمل المدخلة غير صحيحة.",
  WORKER_PAYMENT_NOT_FOUND: "دفعة العامل المحددة غير موجودة.",
  WORKER_PAYMENT_ALREADY_REVERSED: "تم عكس دفعة العامل مسبقًا.",
  WORKER_PAYMENT_EXCEEDS_EARNED: "لا يمكن دفع مبلغ أكبر من الأجر المستحق للعامل.",
  WORKER_PAYMENT_FORBIDDEN: "ليس لديك صلاحية تسجيل أو عكس دفعة العامل.",
  WORKER_PAYMENT_LEDGER_NOT_FOUND: "تعذر العثور على الحركة المالية المرتبطة بدفعة العامل.",
  WORKER_PAYMENT_PAYABLE_NOT_FOUND: "تعذر العثور على التزام الشريك المرتبط بدفعة العامل.",
  WORKER_PAYMENT_RECONCILIATION_REQUIRED: "تعذر عكس الدفعة بسبب عدم تطابق رصيد العامل. راجع سجل العامل.",
  WORK_RECORD_NOT_FOUND: "سجل العمل المحدد غير موجود.",
  WORK_RECORD_ALREADY_CANCELLED: "سجل العمل ملغى مسبقًا.",
  WORK_RECORD_FORBIDDEN: "ليس لديك صلاحية تسجيل أو إلغاء عمل العامل.",
  WORK_RECORD_CANCELLATION_EXCEEDS_UNPAID: "لا يمكن إلغاء سجل العمل لأن جزءًا من أجره تم دفعه.",
  MASTER_DATA_ARCHIVE_FORBIDDEN: "ليس لديك صلاحية أرشفة هذا السجل.",
  CUSTOMER_RESTORE_FORBIDDEN: "ليس لديك صلاحية إزالة هذا الزبون من الأرشيف.",
  CUSTOMER_NOT_FOUND: "الزبون المطلوب غير موجود أو لم يعد متاحًا.",
  QUEUE_CUSTOMER_TENANT_MISMATCH: "الزبون المحدد لا يتبع لهذه المعصرة.",
  QUEUE_RESTORE_INVALID: "بيانات الدور المؤرشف غير مكتملة ولا يمكن استرجاعه.",
  QUEUE_ENTRY_ALREADY_EXISTS: "تم استرجاع هذا الدور مسبقًا.",
  QUEUE_RESTORE_FORBIDDEN: "ليس لديك صلاحية استرجاع هذا الدور.",
  CONTAINER_LINES_INVALID: "تفاصيل التنكات أو الكميات المختارة غير صحيحة.",
  INVOICE_CREATE_FORBIDDEN: "ليس لديك صلاحية إنشاء فاتورة.",
  INVOICE_CANCEL_FORBIDDEN: "ليس لديك صلاحية إلغاء الفاتورة.",
  INVOICE_OPERATION_NOT_FOUND: "تعذر العثور على العملية التجارية المرتبطة بالفاتورة.",
  INVOICE_EFFECT_LINK_NOT_FOUND: "تعذر العثور على آثار الفاتورة المالية أو المخزنية.",
  INVOICE_EFFECT_LINK_IMMUTABLE: "لا يمكن تعديل آثار فاتورة معتمدة مباشرة. ألغِ الفاتورة وأنشئ واحدة جديدة.",
  INVOICE_CASH_EFFECT_NOT_FOUND: "تعذر العثور على الحركة النقدية المرتبطة بالفاتورة.",
  INVOICE_CASH_EFFECT_LINK_INVALID: "الحركة النقدية المرتبطة بالفاتورة غير متطابقة معها.",
  INVOICE_OIL_EFFECT_LINK_INVALID: "حركة الزيت المرتبطة بالفاتورة غير متطابقة معها.",
  INVOICE_UNEXPECTED_CASH_EFFECT: "الفاتورة تحتوي على حركة نقدية غير متوقعة وتحتاج إلى مراجعة.",
  INVOICE_UNEXPECTED_OIL_EFFECT: "الفاتورة تحتوي على حركة زيت غير متوقعة وتحتاج إلى مراجعة.",
  PRODUCT_PURCHASE_CANCEL_FORBIDDEN: "ليس لديك صلاحية إلغاء عملية شراء البضاعة.",
  PRODUCT_PURCHASE_LEDGER_EVENT_NOT_FOUND: "تعذر العثور على الحركة المالية المرتبطة بشراء البضاعة.",
  PRODUCT_SALE_CANCEL_FORBIDDEN: "ليس لديك صلاحية إلغاء عملية بيع البضاعة.",
  PRODUCT_SALE_LEDGER_EVENT_NOT_FOUND: "تعذر العثور على الحركة المالية المرتبطة ببيع البضاعة.",
  PARTNER_TRANSACTION_FORBIDDEN: "ليس لديك صلاحية تسجيل حركة شريك.",
  PARTNER_TRANSACTION_REVERSE_FORBIDDEN: "ليس لديك صلاحية عكس حركة الشريك.",
  IDEMPOTENCY_KEY_REQUIRED: "تعذر تثبيت العملية بأمان. حدّث الصفحة وحاول مرة أخرى.",
  IDEMPOTENCY_KEY_REUSED: "تم استخدام مفتاح العملية لطلب مختلف. حدّث الصفحة ثم أعد المحاولة.",
  COMMAND_INCOMPLETE: "لم تكتمل العملية بالكامل، ولم يتم اعتمادها. حاول مرة أخرى.",
  COMMAND_NAME_REQUIRED: "تعذر تحديد نوع العملية المطلوبة.",
  COMMAND_OPERATION_MISMATCH: "بيانات العملية لا تتطابق مع الطلب الأصلي.",
  COMMAND_RECEIPT_NOT_CLAIMED: "تعذر حجز العملية للتنفيذ الآمن. حاول مرة أخرى.",
  COMMAND_RESULT_REQUIRED: "لم يُرجع الخادم نتيجة مكتملة للعملية.",
  BUSINESS_HISTORY_IMMUTABLE: "لا يمكن تعديل أو حذف سجل مالي تاريخي مباشرة.",
  BUSINESS_OPERATION_IMMUTABLE: "لا يمكن تعديل العملية التجارية بعد اعتمادها.",
  BUSINESS_OPERATION_DELETE_FORBIDDEN: "لا يمكن حذف عملية تجارية معتمدة؛ استخدم الإلغاء أو العكس.",
  BUSINESS_OPERATION_CANCELLATION_IMMUTABLE: "لا يمكن تعديل بيانات إلغاء العملية بعد اعتمادها.",
  BUSINESS_OPERATION_REVERSAL_LINK_IMMUTABLE: "لا يمكن تغيير رابط حركة العكس بعد اعتمادها.",
  BUSINESS_OPERATION_SOURCE_IMMUTABLE: "لا يمكن تغيير مصدر العملية بعد اعتمادها.",
  BUSINESS_OPERATION_STATUS_INVALID: "حالة العملية التجارية غير صالحة.",
  FINANCIAL_EVENT_ACTOR_REQUIRED: "تعذر تحديد المستخدم الذي نفذ الحركة المالية.",
  FINANCIAL_OPERATION_MISMATCH: "الحركة المالية لا تتبع للعملية التجارية المحددة.",
  OBLIGATION_HISTORY_IMMUTABLE: "لا يمكن تعديل أو حذف سجل الالتزامات التاريخي مباشرة.",
  RECEIVABLE_HISTORY_IMMUTABLE: "لا يمكن تعديل أو حذف سجل ذمم الزبائن التاريخي مباشرة.",
  REVERSAL_EFFECT_MISMATCH: "حركة العكس لا تطابق أثر العملية الأصلية.",
  REVERSAL_OF_REVERSAL_FORBIDDEN: "لا يمكن عكس حركة عكس أخرى.",
  REVERSAL_ORIGINAL_NOT_FOUND: "تعذر العثور على الحركة الأصلية المطلوب عكسها.",
  REVERSAL_TENANT_MISMATCH: "لا يمكن عكس حركة تابعة لمعصرة أخرى.",
  SOURCE_DELETED_BY_LEGACY_CASCADE: "السجل الأصلي مفقود بسبب بيانات قديمة ويحتاج إلى مراجعة فنية.",
};

const extractParts = (error: unknown): string[] => {
  if (typeof error === "string") return [error];
  if (error instanceof Error) return [error.message];
  if (!error || typeof error !== "object") return [];

  const candidate = error as ErrorLike;
  return [candidate.code, candidate.message, candidate.details, candidate.hint, candidate.error]
    .filter((part): part is string => typeof part === "string" && part.trim().length > 0);
};

const looksLikeArabicUserMessage = (message: string) => {
  const arabicCharacters = (message.match(/[\u0600-\u06ff]/g) || []).length;
  const latinCharacters = (message.match(/[a-z]/gi) || []).length;
  const containsTechnicalText = /postgres|relation|column|constraint|schema|function|violates|duplicate key|row-level|permission denied/i.test(message);
  return arabicCharacters > 0 && arabicCharacters >= latinCharacters && !containsTechnicalText;
};

/**
 * Converts backend/PostgREST/Auth errors into safe Arabic text for end users.
 * Raw technical details must stay in console logs and must never be shown in UI.
 */
export function getArabicErrorMessage(
  error: unknown,
  fallback = "حدث خطأ غير متوقع. حاول مرة أخرى، وإذا استمرت المشكلة تواصل مع الدعم.",
): string {
  const parts = extractParts(error);
  const combined = parts.join(" | ");
  const normalized = combined.toUpperCase();

  // Longer codes are checked first so a specific code such as
  // INSUFFICIENT_OIL_STOCK_FOR_CANCELLATION is not mistaken for its shorter prefix.
  for (const [code, message] of Object.entries(ERROR_MESSAGES).sort(
    ([left], [right]) => right.length - left.length,
  )) {
    if (normalized.includes(code)) return message;
  }

  if (/23505|DUPLICATE KEY|UNIQUE CONSTRAINT|ALREADY REGISTERED|ALREADY EXISTS/i.test(combined)) {
    return "هذه البيانات مستخدمة مسبقًا. غيّر الاسم أو القيمة ثم حاول مرة أخرى.";
  }
  if (/23503|FOREIGN KEY/i.test(combined)) {
    return "لا يمكن تنفيذ العملية لأن السجل مرتبط ببيانات أخرى.";
  }
  if (/23514|CHECK CONSTRAINT|VIOLATES CHECK/i.test(combined)) {
    return "القيمة المدخلة غير مقبولة. راجع البيانات وحاول مرة أخرى.";
  }
  if (/42501|PERMISSION DENIED|ROW-LEVEL SECURITY|RLS/i.test(combined) || /_FORBIDDEN\b/.test(normalized)) {
    return "ليس لديك صلاحية لتنفيذ هذه العملية.";
  }
  if (/PGRST202|SCHEMA CACHE|COULD NOT FIND THE FUNCTION/i.test(combined)) {
    return "الخدمة المطلوبة غير محدثة حاليًا. حدّث الصفحة وحاول مجددًا.";
  }
  if (/PGRST204|COULD NOT FIND.*COLUMN/i.test(combined)) {
    return "تعذر حفظ البيانات لأن إصدار قاعدة البيانات غير متوافق. تواصل مع الدعم.";
  }
  if (/JWT|TOKEN.*EXPIRED|INVALID.*TOKEN|REFRESH TOKEN/i.test(combined)) {
    return "انتهت جلسة الدخول. سجّل الدخول مجددًا ثم حاول مرة أخرى.";
  }
  if (/FAILED TO FETCH|NETWORK|LOAD FAILED|TIMEOUT|TIMED OUT/i.test(combined)) {
    return "تعذر الاتصال بالخادم. تحقق من الإنترنت ثم حاول مرة أخرى.";
  }
  if (/_NOT_FOUND\b/.test(normalized)) {
    return "السجل المطلوب غير موجود أو لم يعد متاحًا.";
  }
  if (/_REQUIRED\b/.test(normalized)) {
    return "يرجى تعبئة جميع البيانات المطلوبة لإتمام العملية.";
  }
  if (/_INVALID\b/.test(normalized)) {
    return "بعض البيانات المدخلة غير صحيحة. راجعها ثم حاول مرة أخرى.";
  }
  if (/_ALREADY_CANCELLED\b|_ALREADY_REVERSED\b/.test(normalized)) {
    return "تم إلغاء أو عكس هذه العملية مسبقًا.";
  }

  const localizedPart = parts.find(looksLikeArabicUserMessage);
  return localizedPart || fallback;
}
