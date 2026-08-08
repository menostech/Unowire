import { adminApi } from '@/lib/adminApi';
import { PostForm } from '@/components/admin/form/PostForm';

export default async function NewPostPage() {
  const categories = (await adminApi.postCategories.all()).map((c) => ({
    id: c.id,
    label: c.label,
  }));

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">New Post</h1>
      <PostForm categories={categories} />
    </div>
  );
}
