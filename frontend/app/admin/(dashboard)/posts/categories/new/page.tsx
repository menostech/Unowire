import { PostCategoryForm } from '@/components/admin/form/PostCategoryForm';

export default async function NewPostCategoryPage() {
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">New Post Category</h1>
      <PostCategoryForm />
    </div>
  );
}
