"use client";

import { useState, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";

// Use useLayoutEffect for DOM operations, but fall back to useEffect for SSR
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

interface ToastProps {
  id: string;
  title: string;
  description?: string;
  variant?: "default" | "success" | "destructive";
  duration?: number;
  onClose: () => void;
}

export const Toast = ({
  id,
  title,
  description,
  variant = "default",
  duration = 3000,
  onClose,
}: ToastProps) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  // Calculate variant-specific styles
  const getBgColor = () => {
    switch (variant) {
      case "success":
        return "bg-green-600";
      case "destructive":
        return "bg-red-600";
      default:
        return "bg-gray-800";
    }
  };

  return (
    <div
      className={`${getBgColor()} text-white p-4 rounded-md shadow-lg max-w-sm w-full mb-2 transition-all duration-300 ease-in-out transform translate-x-0 opacity-100`}
      role="alert"
    >
      <div className="flex justify-between items-start">
        <div>
          <h3 className="font-medium">{title}</h3>
          {description && <p className="text-sm opacity-90 mt-1">{description}</p>}
        </div>
        <button
          className="ml-4 text-white opacity-70 hover:opacity-100"
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>
      </div>
    </div>
  );
};

interface ToastContextValue {
  toast: (props: Omit<ToastProps, "id" | "onClose">) => void;
}

// Simple toast implementation for use in components
let toastCount = 0;
let addToast: (toast: ToastProps) => void = () => {}; // Will be replaced when ToastProvider mounts

export function toast({ title, description, variant, duration }: Omit<ToastProps, "id" | "onClose">) {
  const id = `toast-${toastCount++}`;
  addToast({
    id,
    title,
    description,
    variant,
    duration,
    onClose: () => {},
  });
}

// Toast container
export const ToastContainer = () => {
  const [toasts, setToasts] = useState<ToastProps[]>([]);
  const [isMounted, setIsMounted] = useState(false);

  // Only mount on the client side
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Update addToast function to use this component's state
  useIsomorphicLayoutEffect(() => {
    if (isMounted) {
      addToast = (toast: ToastProps) => {
        setToasts((prev) => [...prev, toast]);
      };
    }

    return () => {
      if (isMounted) {
        addToast = () => {};
      }
    };
  }, [isMounted]);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  // Don't render anything during SSR or before mount
  if (!isMounted) {
    return null;
  }

  // No need to check for window as we've already confirmed we're mounted
  return createPortal(
    <div className="fixed top-4 right-4 z-50 flex flex-col items-end space-y-2">
      {toasts.map((toast) => (
        <Toast key={toast.id} {...toast} onClose={() => removeToast(toast.id)} />
      ))}
    </div>,
    document.body
  );
};

export function useToast() {
  return { toast };
} 