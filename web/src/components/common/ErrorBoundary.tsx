import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  resetOnPropsChange?: boolean;
  resetKeys?: Array<string | number | boolean | null | undefined>;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorId: string | null;
}

class ErrorBoundary extends Component<Props, State> {
  private resetTimeoutId: number | null = null;

  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    // Generate a unique error ID for tracking
    const errorId = `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    return {
      hasError: true,
      error,
      errorId,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log error details for debugging
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    
    // Store error info in state
    this.setState({
      errorInfo,
    });

    // Call optional error handler
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    // Log structured error data for production debugging
    this.logErrorDetails(error, errorInfo);
  }

  componentDidUpdate(prevProps: Props) {
    const { resetOnPropsChange, resetKeys } = this.props;
    const { hasError } = this.state;

    // Reset error state when resetKeys change
    if (hasError && resetOnPropsChange && resetKeys) {
      const hasResetKeyChanged = resetKeys.some((key, index) => {
        const prevKey = prevProps.resetKeys?.[index];
        return key !== prevKey;
      });

      if (hasResetKeyChanged) {
        this.resetErrorBoundary();
      }
    }
  }

  componentWillUnmount() {
    if (this.resetTimeoutId) {
      clearTimeout(this.resetTimeoutId);
    }
  }

  private logErrorDetails = (error: Error, errorInfo: ErrorInfo) => {
    const errorDetails = {
      timestamp: new Date().toISOString(),
      errorId: this.state.errorId,
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      userAgent: navigator.userAgent,
      url: window.location.href,
    };

    // In production, this could be sent to an error tracking service
    console.error('Structured error log:', errorDetails);
    
    // Store in localStorage for debugging (limit to last 10 errors)
    try {
      const existingErrors = JSON.parse(localStorage.getItem('backtester_errors') || '[]');
      const updatedErrors = [errorDetails, ...existingErrors.slice(0, 9)];
      localStorage.setItem('backtester_errors', JSON.stringify(updatedErrors));
    } catch (e) {
      console.warn('Failed to store error in localStorage:', e);
    }
  };

  private resetErrorBoundary = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: null,
    });
  };

  private handleRetry = () => {
    this.resetErrorBoundary();
  };

  private handleReportError = () => {
    const { error, errorInfo, errorId } = this.state;
    
    if (error && errorId) {
      const reportData = {
        errorId,
        message: error.message,
        stack: error.stack,
        componentStack: errorInfo?.componentStack,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        url: window.location.href,
      };

      // Copy error details to clipboard for easy reporting
      navigator.clipboard.writeText(JSON.stringify(reportData, null, 2)).then(() => {
        alert('Error details copied to clipboard. Please report this issue to the development team.');
      }).catch(() => {
        // Fallback: show error details in a modal or alert
        alert(`Error ID: ${errorId}\nPlease report this error with the following details:\n${error.message}`);
      });
    }
  };

  render() {
    const { hasError, error, errorId } = this.state;
    const { children, fallback } = this.props;

    if (hasError) {
      // Use custom fallback if provided
      if (fallback) {
        return fallback;
      }

      // Default error UI
      return (
        <div className="min-h-[400px] flex items-center justify-center bg-gray-50 border border-gray-200 rounded-lg">
          <div className="text-center p-8 max-w-md">
            <div className="mb-4">
              <svg
                className="mx-auto h-12 w-12 text-red-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.962-.833-2.732 0L3.082 16.5c-.77.833.192 2.5 1.732 2.5z"
                />
              </svg>
            </div>
            
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Something went wrong
            </h3>
            
            <p className="text-sm text-gray-600 mb-4">
              The backtester component encountered an unexpected error. This might be due to invalid data, a network issue, or a temporary glitch.
            </p>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-md p-3 mb-4">
                <p className="text-xs text-red-800 font-mono">
                  {error.message}
                </p>
                {errorId && (
                  <p className="text-xs text-gray-500 mt-1">
                    Error ID: {errorId}
                  </p>
                )}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              <button
                onClick={this.handleRetry}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Try Again
              </button>
              
              <button
                onClick={this.handleReportError}
                className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Report Error
              </button>
            </div>

            <div className="mt-4 text-xs text-gray-500">
              <p>Possible solutions:</p>
              <ul className="list-disc list-inside mt-1 text-left space-y-1">
                <li>Refresh the page and try loading different data</li>
                <li>Check your internet connection</li>
                <li>Try a different time period or contract</li>
                <li>Clear your browser cache and reload</li>
              </ul>
            </div>
          </div>
        </div>
      );
    }

    return children;
  }
}

export default ErrorBoundary;
