'use client';

import { useCallback, useRef, useState } from 'react';
import type { DragEndEvent } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import type { PropertyImage } from '@spm/shared';
import type { useApi } from '@/hooks/use-api';
import type { useToast } from '@/hooks/use-toast';
import type { MediaFileItem } from './types';

interface UploadedFile { id: number; url: string; originalFilename: string; sortOrder: number; }

/**
 * Photos uploaded on this page, plus the feed's own photos kept aside.
 *
 * `images` holds only files uploaded here. A feed listing's photos are links
 * from the feed, so they are kept aside and sent back untouched; and photos
 * are only sent at all when the user changed them, so a save never wipes them.
 */
export function usePropertyImages({
  api,
  toast,
  propertyId,
}: {
  api: ReturnType<typeof useApi<any>>;
  toast: ReturnType<typeof useToast>['toast'];
  propertyId: number;
}) {
  const [images, setImages] = useState<MediaFileItem[]>([]);
  const feedImagesRef = useRef<Array<{ url: string; order?: number; alt?: string }>>([]);
  const imagesChangedRef = useRef(false);

  /** Seed from the property row and its uploaded files (GET /upload/property/:id). */
  const load = (propertyImages: PropertyImage[] | null | undefined, files: unknown) => {
    const fileList = (Array.isArray(files) ? files : []) as UploadedFile[];
    if (Array.isArray(files)) {
      setImages(fileList.map((f) => ({
        id: f.id,
        url: f.url,
        originalFilename: f.originalFilename,
        sortOrder: f.sortOrder,
      })));
    }
    const uploadedUrls = new Set(fileList.map((f) => f.url));
    feedImagesRef.current = (Array.isArray(propertyImages) ? propertyImages : [])
      .filter((img) => img?.url && !uploadedUrls.has(img.url));
  };

  const handleImageUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    for (const file of Array.from(files)) {
      const tempId = Math.random().toString(36).substring(7);
      const localUrl = URL.createObjectURL(file);

      setImages((prev) => [
        ...prev,
        { id: -1, url: localUrl, originalFilename: file.name, sortOrder: prev.length, isUploading: true, tempId },
      ]);

      try {
        const formPayload = new FormData();
        formPayload.append('file', file);
        const result = await api.post(`/api/dashboard/upload?propertyId=${propertyId}`, formPayload);
        const uploaded = result.data || result;
        URL.revokeObjectURL(localUrl);
        imagesChangedRef.current = true;
        setImages((prev) =>
          prev.map((img) =>
            img.tempId === tempId
              ? { id: uploaded.id, url: uploaded.url, originalFilename: uploaded.originalFilename, sortOrder: img.sortOrder }
              : img
          )
        );
      } catch {
        setImages((prev) => prev.filter((img) => img.tempId !== tempId));
        toast({ title: 'Upload failed', description: `Failed to upload ${file.name}`, variant: 'destructive' });
      }
    }
    e.target.value = '';
  }, [api, toast, propertyId]);

  const handleRemoveImage = useCallback(async (fileId: number) => {
    try {
      await api.delete(`/api/dashboard/upload/${fileId}`);
      imagesChangedRef.current = true;
      setImages((prev) => prev.filter((img) => img.id !== fileId));
    } catch {
      toast({ title: 'Error', description: 'Failed to delete image.', variant: 'destructive' });
    }
  }, [api, toast]);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    imagesChangedRef.current = true;

    setImages((prev) => {
      const oldIndex = prev.findIndex((img) => img.id === active.id);
      const newIndex = prev.findIndex((img) => img.id === over.id);
      const reordered = arrayMove(prev, oldIndex, newIndex);
      // Persist new order to server
      const fileIds = reordered.map((img) => img.id);
      api.put(`/api/dashboard/upload/property/${propertyId}/order`, { fileIds }).catch(() => {
        toast({ title: 'Error', description: 'Failed to save image order.', variant: 'destructive' });
      });
      return reordered;
    });
  }, [api, propertyId, toast]);

  /** The photos to save, or undefined when nothing changed here. Feed photos stay first. */
  const imagesForSave = (): Array<{ url: string; alt: string }> | undefined => {
    if (!imagesChangedRef.current) return undefined;
    return [
      ...feedImagesRef.current.map((img) => ({ url: img.url, alt: img.alt || '' })),
      ...images.filter((img) => img.id > 0).map((img) => ({ url: img.url, alt: '' })),
    ];
  };

  return { images, load, handleImageUpload, handleRemoveImage, handleDragEnd, imagesForSave };
}
