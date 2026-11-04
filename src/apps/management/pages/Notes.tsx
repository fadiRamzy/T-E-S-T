import { useApp } from '../state/store';
import { PageHeader } from '../components/ui';
import { EmployeeNotesManager } from '../components/EmployeeNotes';

/**
 * صفحة «الملاحظات والمتابعة» — مخصصة بالكامل لـ«ملاحظات الموظفين»:
 * اختيار موظف + كتابة ملاحظة + حفظها + عرض الملاحظات المحفوظة (مع إخفاء/إظهار).
 * (سجل المتابعة المنظم له صفحة مستقلة الآن في #/mgmt/observations.)
 */
export function NotesPage() {
  const { data } = useApp();
  return (
    <>
      <PageHeader
        eyebrow="الموظفون والمتابعة"
        title="الملاحظات والمتابعة"
        description="أضف ملاحظة مرتبطة بموظف، أو اعرض الملاحظات المحفوظة له سابقًا."
      />
      <EmployeeNotesManager employees={data.employees} notes={data.employeeNotes} collapsibleNotes defaultHidden />
    </>
  );
}
