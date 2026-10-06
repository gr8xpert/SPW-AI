'use client';

import { GripVertical, Image as ImageIcon, Loader2, Upload, X } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { TabsContent } from '@/components/ui/tabs';
import type { MediaFileItem } from './types';

function SortableImage({
  image, isMain, onRemove,
}: { image: MediaFileItem; isMain: boolean; onRemove: (id: number) => void; }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: image.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <div ref={setNodeRef} style={style} className="relative group aspect-square rounded-lg overflow-hidden border">
      {image.isUploading ? (
        <div className="absolute inset-0 flex items-center justify-center bg-muted">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <img src={image.url} alt={image.originalFilename} className="object-cover w-full h-full" />
          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
            <Button variant="secondary" size="icon" className="h-8 w-8 cursor-grab" {...attributes} {...listeners}>
              <GripVertical className="h-4 w-4" />
            </Button>
            <Button variant="destructive" size="icon" className="h-8 w-8" onClick={() => onRemove(image.id)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          {isMain && (
            <div className="absolute top-2 left-2 bg-primary text-primary-foreground text-xs px-2 py-1 rounded">Main</div>
          )}
        </>
      )}
    </div>
  );
}

export function ImagesTab({
  images,
  feedImages,
  onUpload,
  onRemove,
  onDragEnd,
}: {
  images: MediaFileItem[];
  feedImages: Array<{ url: string; alt?: string }>;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemove: (id: number) => void;
  onDragEnd: (event: DragEndEvent) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  return (
    <TabsContent value="images" className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Property Images</CardTitle>
          <CardDescription>Upload images and drag to reorder. The first image becomes the main photo.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                <Upload className="h-8 w-8 mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground"><span className="font-semibold">Click to upload</span> or drag and drop</p>
                <p className="text-xs text-muted-foreground">PNG, JPG, WebP up to 10MB</p>
              </div>
              <input type="file" className="hidden" accept="image/*" multiple onChange={onUpload} />
            </label>

            {feedImages.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  From the feed ({feedImages.length}) <span className="font-normal text-muted-foreground">— kept in step with the feed, shown first</span>
                </p>
                <div className="grid gap-4 grid-cols-2 md:grid-cols-4 lg:grid-cols-6">
                  {feedImages.map((img, index) => (
                    <div key={img.url} className="relative aspect-square rounded-lg overflow-hidden border">
                      <img src={img.url} alt={img.alt || ''} loading="lazy" className="object-cover w-full h-full" />
                      {index === 0 && (
                        <div className="absolute top-2 left-2 bg-primary text-primary-foreground text-xs px-2 py-1 rounded">Main</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {images.length > 0 && (
              <div className="space-y-2">
                {feedImages.length > 0 && <p className="text-sm font-medium">Uploaded here ({images.length})</p>}
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                  <SortableContext items={images.map((img) => img.id)} strategy={rectSortingStrategy}>
                    <div className="grid gap-4 grid-cols-2 md:grid-cols-4 lg:grid-cols-6">
                      {images.map((image, index) => (
                        <SortableImage key={image.tempId || image.id} image={image} isMain={index === 0 && feedImages.length === 0} onRemove={onRemove} />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              </div>
            )}

            {images.length === 0 && feedImages.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <ImageIcon className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No photos yet</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </TabsContent>
  );
}
