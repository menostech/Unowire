import { EmailTemplateForm } from '@/components/admin/form/EmailTemplateForm';

export default async function EmailTemplateEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div>
      <h1 className="text-xl font-bold mb-4">Edit Template: {id}</h1>
      <EmailTemplateForm templateId={id} />
    </div>
  );
}
