import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AppBar,
  Toolbar,
  Typography,
  Container,
  Box,
  Card,
  CardContent,
  Paper,
  Grid,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
  Snackbar,
} from "@mui/material";
import PaymentRequestForm from "./PaymentRequestForm";

const TOAST_AUTO_HIDE_MS = 6000;

const isVisualforceOrigin = (origin) => origin.includes("sandbox.vf.force.com");

const CUSTOMER_MESSAGE_TYPES = new Set([2, "2", "CUSTOMER_SELECTED"]);

const isCustomerSelectionMessage = (data) => {
  if (!data || typeof data !== "object") {
    return false;
  }
  if (CUSTOMER_MESSAGE_TYPES.has(data.gwMessageType)) {
    return true;
  }
  const payload = data.gwPayload;
  if (!payload || typeof payload !== "object") {
    return false;
  }
  const hasCustomerIdentity = Boolean(
    String(payload.partyId || "").trim() || String(payload.salesforceId || "").trim()
  );
  const looksLikePayNowPayload =
    payload.paymentReference != null ||
    payload.paymentAmount != null ||
    payload.receiptNumber != null;
  return hasCustomerIdentity && !looksLikePayNowPayload;
};

const extractPayNowResponse = (data) => {
  if (!data || typeof data !== "object") {
    return null;
  }
  if (data.gwMessageType === "PAY_NOW_RESPONSE" && data.gwPayload) {
    return data.gwPayload;
  }
  if (data.gwMessageType !== undefined) {
    return null;
  }
  if (!Object.prototype.hasOwnProperty.call(data, "correlationId")) {
    return null;
  }
  if (!Object.prototype.hasOwnProperty.call(data, "paymentAmount")) {
    return null;
  }
  return data;
};

function App() {
  const [sfData, setSfData] = useState(null);
  const [paymentIframeLoaded, setPaymentIframeLoaded] = useState(false);
  const [paymentDismissed, setPaymentDismissed] = useState(false);
  const [showLeavePaymentDialog, setShowLeavePaymentDialog] = useState(false);
  const [paymentIframeSrc, setPaymentIframeSrc] = useState("");
  const [paymentLoadId, setPaymentLoadId] = useState(0);
  const [payNowResponse, setPayNowResponse] = useState(null);
  const [toast, setToast] = useState({
    open: false,
    message: "",
    severity: "info",
  });

  const paymentIframeContainerRef = useRef(null);
  const paymentIframeRef = useRef(null);

  const showToast = useCallback((message, severity = "info") => {
    setToast({ open: true, message, severity });
  }, []);

  const handleToastClose = (_event, reason) => {
    if (reason === "clickaway") {
      return;
    }
    setToast((current) => ({ ...current, open: false }));
  };

  const partyId =
    sfData?.gwPayload?.partyId ||
    sfData?.gwPayload?.salesforceId ||
    "";

  const isPaymentActive =
    Boolean(paymentIframeSrc) && paymentIframeLoaded && !paymentDismissed;

  useEffect(() => {
    setPaymentIframeLoaded(false);
    setPaymentDismissed(false);
    setShowLeavePaymentDialog(false);
    setPaymentIframeSrc("");
    setPayNowResponse(null);
  }, [partyId]);

  useEffect(() => {
    const handleMessage = (event) => {
      const fromVisualforce = isVisualforceOrigin(event.origin);

      if (!fromVisualforce) return;

      const data = event.data;

      if (data === null) {
        if (fromVisualforce) {
          setSfData(null);
        }
        return;
      }

      if (typeof data !== "object" || data === null) {
        return;
      }

      const payNowPayload = extractPayNowResponse(data);
      if (payNowPayload) {
        setPayNowResponse(payNowPayload);
        return;
      }

      if (data.gwMessageType === "PAYMENT_URL_PAYLOAD") {
        return;
      }

      if (typeof data.gwMessageType !== "undefined" && isCustomerSelectionMessage(data)) {
        setSfData(data);
      }
    };

    window.addEventListener("message", handleMessage);

    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, []);

  useEffect(() => {
    if (!isPaymentActive) {
      return undefined;
    }

    const handleOutsideClick = (event) => {
      if (showLeavePaymentDialog) {
        return;
      }

      if (
        paymentIframeContainerRef.current &&
        !paymentIframeContainerRef.current.contains(event.target)
      ) {
        event.preventDefault();
        event.stopPropagation();
        setShowLeavePaymentDialog(true);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick, true);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick, true);
    };
  }, [isPaymentActive, showLeavePaymentDialog]);

  useEffect(() => {
    if (paymentDismissed) {
      showToast(
        "Payment was closed. Submit the form again to reload the payment iframe.",
        "warning"
      );
    }
  }, [paymentDismissed, showToast]);

  useEffect(() => {
    if (!payNowResponse?.paymentStatus) {
      return;
    }
    if (payNowResponse.paymentStatus === "FAILED") {
      showToast("Payment failed.", "error");
      return;
    }
    if (!payNowResponse.receiptNumber) {
      return;
    }
    showToast(
      `Payment status: ${payNowResponse.paymentStatus}. Receipt: ${payNowResponse.receiptNumber}`,
      payNowResponse.paymentStatus === "SUCCESS" ? "success" : "error"
    );
  }, [payNowResponse, showToast]);

  const focusPaymentIframe = () => {
    paymentIframeRef.current?.focus();
    try {
      paymentIframeRef.current?.contentWindow?.focus();
    } catch (error) {
      console.warn("Unable to focus payment iframe:", error);
    }
  };

  const handleConfirmLeavePayment = () => {
    setShowLeavePaymentDialog(false);
    setPaymentDismissed(true);
  };

  const handleCancelLeavePayment = () => {
    setShowLeavePaymentDialog(false);
    focusPaymentIframe();
  };

  const handleValidPaymentRequest = (paymentUrl) => {
    setPayNowResponse(null);
    setPaymentIframeLoaded(false);
    setPaymentDismissed(false);
    setShowLeavePaymentDialog(false);
    setPaymentLoadId((current) => current + 1);
    setPaymentIframeSrc(paymentUrl);
  };

  const handlePaymentIframeLoad = () => {
    setPaymentIframeLoaded(true);
  };

  const payNowResponseFieldOrder = [
    "paymentStatus",
    "policyNumber",
    "quoteNumber",
    "paymentAmount",
    "receiptNumber",
    "paymentNumber",
    "sessionId",
    "correlationId",
  ];

return (
    <Box sx={{ backgroundColor: "#f4f6f8", minHeight: "100vh" }}>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1, textAlign: "center" }}>
            IAG POC - Salesforce Integration with I frame
          </Typography>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ mt: 4, pb: 4 }}>
        <Paper
          elevation={4}
          sx={{
            padding: 3,
            borderRadius: 3,
            mb: 4,
            backgroundColor: "#ffffff",
          }}
        >
          <Typography variant="h6" gutterBottom align="center">
            {sfData ? "Customer Found - Proceed to Payment" : "Search for a Customer"}
          </Typography>

          <Grid container spacing={3}>
            <Grid item xs={12}>
              <Typography variant="subtitle2" color="textSecondary" sx={{ mb: 1 }}>
                Search Customer
              </Typography>
              <Box
                sx={{
                  border: "2px solid #1976d2",
                  borderRadius: 2,
                  overflow: "hidden",
                }}
              >
                <iframe
                  src="https://racv--iagiqa--c.sandbox.vf.force.com/apex/ExternalCustomerManagerVF"
                  width="100%"
                  height="500px"
                  style={{ border: "none" }}
                  title="Search Iframe"
                />
              </Box>
            </Grid>

            <Grid item xs={12}>
              <PaymentRequestForm
                partyId={partyId}
                showMissingPartyAlert={Boolean(sfData) && !partyId}
                onValidSubmit={handleValidPaymentRequest}
              />
            </Grid>

            {paymentIframeSrc && !paymentDismissed && (
              <Grid item xs={12}>
                <Typography variant="subtitle2" color="textSecondary" sx={{ mb: 1 }}>
                  Payment Setup
                  {sfData?.gwPayload?.name ? ` for ${sfData.gwPayload.name}` : ""}
                </Typography>
                <Box
                  ref={paymentIframeContainerRef}
                  sx={{
                    border: "2px solid #2e7d32",
                    borderRadius: 2,
                    overflow: "hidden",
                  }}
                >
                  <iframe
                    key={paymentLoadId}
                    ref={paymentIframeRef}
                    src={paymentIframeSrc}
                    width="100%"
                    height="550px"
                    style={{ border: "none" }}
                    title="Payment Iframe"
                    tabIndex={0}
                    onLoad={handlePaymentIframeLoad}
                  />
                </Box>
              </Grid>
            )}

          </Grid>
        </Paper>

        <Card elevation={3} sx={{ borderRadius: 3, mb: 4 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Pay Now Response
            </Typography>
            {payNowResponse ? (
              <Grid container spacing={2}>
                {payNowResponseFieldOrder.map((key) => (
                  <Grid item xs={12} sm={6} key={key}>
                    <Typography>
                      <strong>{key}:</strong>{" "}
                      {payNowResponse[key] === "" ||
                      payNowResponse[key] === null ||
                      payNowResponse[key] === undefined
                        ? "—"
                        : String(payNowResponse[key])}
                    </Typography>
                  </Grid>
                ))}
              </Grid>
            ) : (
              <Typography color="text.secondary">
                {paymentIframeSrc && !paymentDismissed
                  ? "Complete payment in the iframe to receive the Pay Now response..."
                  : "No Pay Now response yet..."}
              </Typography>
            )}
          </CardContent>
        </Card>
      </Container>

      <Dialog
        open={showLeavePaymentDialog}
        onClose={handleCancelLeavePayment}
        aria-labelledby="leave-payment-dialog-title"
      >
        <DialogTitle id="leave-payment-dialog-title">
          Payment In Progress
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            Do not allow other operations while a payment is in progress.
          </DialogContentText>
          <DialogContentText sx={{ mt: 2 }}>
            Are you sure you want to do something else?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancelLeavePayment} color="primary" variant="contained">
            No
          </Button>
          <Button onClick={handleConfirmLeavePayment} color="warning" variant="outlined">
            Yes
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={toast.open}
        autoHideDuration={TOAST_AUTO_HIDE_MS}
        onClose={handleToastClose}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          onClose={handleToastClose}
          severity={toast.severity}
          variant="filled"
          sx={{ width: "100%" }}
        >
          {toast.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

export default App;
