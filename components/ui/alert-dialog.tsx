import * as React from "react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "./button";
import { motion, AnimatePresence } from "framer-motion";

interface AlertDialogContextType {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

const AlertDialogContext = React.createContext<AlertDialogContextType | undefined>(undefined);

interface AlertDialogProps {
  children: React.ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const AlertDialog: React.FC<AlertDialogProps> = ({
  children,
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange,
}) => {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);

  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;

  const setOpen = React.useCallback((value: boolean | ((prev: boolean) => boolean)) => {
    if (!isControlled) {
      setUncontrolledOpen(value);
    }
    if (onOpenChange) {
      const newValue = typeof value === "function" ? value(open) : value;
      onOpenChange(newValue);
    }
  }, [isControlled, onOpenChange, open]);

  return (
    <AlertDialogContext.Provider value={{ open, setOpen }}>
      {children}
    </AlertDialogContext.Provider>
  );
};

interface AlertDialogTriggerProps {
  children: React.ReactNode;
  asChild?: boolean;
}

const AlertDialogTrigger = React.forwardRef<HTMLButtonElement, AlertDialogTriggerProps & React.ButtonHTMLAttributes<HTMLButtonElement>>(
  ({ children, asChild = false, ...props }, ref) => {
    const context = React.useContext(AlertDialogContext);
    if (!context) {
      throw new Error("AlertDialogTrigger must be used within an AlertDialog");
    }

    const { setOpen } = context;

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      setOpen(true);

      // Call the original onClick if it exists
      if (props.onClick) {
        props.onClick(e);
      }
    };

    // Remove onClick from props to avoid duplicate handlers
    const { onClick, ...otherProps } = props;

    if (asChild) {
      return (
        <>
          {React.Children.map(children, child => {
            if (React.isValidElement(child)) {
              const element = child as React.ReactElement<any>;
              return React.cloneElement(element, {
                ...element.props,
                ref,
                onClick: handleClick
              });
            }
            return child;
          })}
        </>
      );
    }

    return (
      <button
        ref={ref}
        type="button"
        onClick={handleClick}
        {...otherProps}
      >
        {children}
      </button>
    );
  }
);
AlertDialogTrigger.displayName = "AlertDialogTrigger";

const AlertDialogPortal: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return <>{children}</>;
};

const AlertDialogOverlay = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  const context = React.useContext(AlertDialogContext);
  if (!context) {
    throw new Error("AlertDialogOverlay must be used within an AlertDialog");
  }

  const { open } = context;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={ref}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className={cn(
            "fixed inset-0 z-50 bg-background/80 backdrop-blur-sm",
            className
          )}
          {...Object.keys(props).reduce((acc: { [key: string]: any }, key) => {
            if (key === 'onDrag' || key === 'onAnimationStart' || key === 'onTransitionEnd') {
              return acc;
            }
            acc[key] = (props as any)[key];
            return acc;
          }, {})}
        />
      )}
    </AnimatePresence>
  );
});
AlertDialogOverlay.displayName = "AlertDialogOverlay";

const AlertDialogContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => {
  const context = React.useContext(AlertDialogContext);
  if (!context) {
    throw new Error("AlertDialogContent must be used within an AlertDialog");
  }

  const { open, setOpen } = context;

  // Add click outside functionality
  const contentRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (contentRef.current && !contentRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open, setOpen]);

  return (
    <AnimatePresence>
      {open && (
        <AlertDialogPortal>
          <AlertDialogOverlay />
          <motion.div
            ref={(node) => {
              if (typeof ref === "function") {
                ref(node);
              } else if (ref) {
                (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
              }
              (contentRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
            }}
            className={cn(
              "fixed left-[50%] top-[50%] z-50 grid w-[calc(100%-2rem)] max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 rounded-2xl border bg-background p-6 shadow-lg",
              className
            )}
            initial={{ opacity: 0, scale: 0.3, x: "-50%", y: "-50%" }}
            animate={{ opacity: 1, scale: 1, x: "-50%", y: "-50%" }}
            exit={{ opacity: 0, scale: 0.3, x: "-50%", y: "-50%" }}
            transition={{
              type: "spring",
              damping: 25,
              stiffness: 400,
              opacity: { duration: 0.2 }
            }}
            {...Object.keys(props).reduce((acc: { [key: string]: any }, key) => {
              if (key === 'onDrag' || key === 'onAnimationStart' || key === 'onTransitionEnd') {
                return acc;
              }
              acc[key] = (props as any)[key];
              return acc;
            }, {})}
          >
            {children}
          </motion.div>
        </AlertDialogPortal>
      )}
    </AnimatePresence>
  );
});
AlertDialogContent.displayName = "AlertDialogContent";

const AlertDialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-2 text-center sm:text-left",
      className
    )}
    {...props}
  />
);
AlertDialogHeader.displayName = "AlertDialogHeader";

const AlertDialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      className
    )}
    {...props}
  />
);
AlertDialogFooter.displayName = "AlertDialogFooter";

const AlertDialogTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h2
    ref={ref}
    className={cn("text-lg font-semibold", className)}
    {...props}
  />
));
AlertDialogTitle.displayName = "AlertDialogTitle";

const AlertDialogDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
AlertDialogDescription.displayName = "AlertDialogDescription";

interface AlertDialogActionProps extends React.ButtonHTMLAttributes<HTMLButtonElement> { }

const AlertDialogAction = React.forwardRef<
  HTMLButtonElement,
  AlertDialogActionProps
>(({ className, ...props }, ref) => {
  const context = React.useContext(AlertDialogContext);
  if (!context) {
    throw new Error("AlertDialogAction must be used within an AlertDialog");
  }

  const { setOpen } = context;

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    setOpen(false);

    if (props.onClick) {
      props.onClick(e);
    }
  };

  const { onClick, ...otherProps } = props;

  return (
    <button
      ref={ref}
      className={cn(buttonVariants(), className)}
      onClick={handleClick}
      {...otherProps}
    />
  );
});
AlertDialogAction.displayName = "AlertDialogAction";

interface AlertDialogCancelProps extends React.ButtonHTMLAttributes<HTMLButtonElement> { }

const AlertDialogCancel = React.forwardRef<
  HTMLButtonElement,
  AlertDialogCancelProps
>(({ className, ...props }, ref) => {
  const context = React.useContext(AlertDialogContext);
  if (!context) {
    throw new Error("AlertDialogCancel must be used within an AlertDialog");
  }

  const { setOpen } = context;

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    setOpen(false);

    if (props.onClick) {
      props.onClick(e);
    }
  };

  const { onClick, ...otherProps } = props;

  return (
    <button
      ref={ref}
      className={cn(
        buttonVariants({ variant: "outline" }),
        "mt-2 sm:mt-0",
        className
      )}
      onClick={handleClick}
      {...otherProps}
    />
  );
});
AlertDialogCancel.displayName = "AlertDialogCancel";

export {
  AlertDialog,
  AlertDialogPortal,
  AlertDialogOverlay,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
};
