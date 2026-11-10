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
const VF_SESSION_STALE_MS = 45000;
const VF_SESSION_PROBE_MS = 20000;
const VF_SESSION_TICK_MS = 1000;

const isVisualforceOrigin = (origin) => origin.includes("sandbox.vf.force.com");

const parsePayNowSessionIdFromUrl = (url) => {
  if (!url) {
    return "";
  }
  try {
    return new URL(url).searchParams.get("sessionId") || "";
  } catch (error) {
    return "";
  }
};

const extractSessionIdFromMessage = (data) => {
  if (!data || typeof data !== "object") {
    return "";
  }
  if (data.type === "IAG_SF_SESSION" && data.sessionId) {
    return String(data.sessionId);
  }
  if (data.gwPayload?.sessionId) {
    return String(data.gwPayload.sessionId);
  }
  if (data.sessionId) {
    return String(data.sessionId);
  }
  return "";
};

const formatClockTime = (date) => {
  if (!date) {
    return "—";
  }
  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
};

const MANAGER_VF_URL =
  "https://racv--iagiqa--c.sandbox.vf.force.com/apex/ExternalCustomerManagerVF";

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
  const [payNowSessionId, setPayNowSessionId] = useState("");
  const [vfReportedSessionId, setVfReportedSessionId] = useState("");
  const [lastVfActivityAt, setLastVfActivityAt] = useState(null);
  const [vfConnectivity, setVfConnectivity] = useState("unknown");
  const [managerIframeStatus, setManagerIframeStatus] = useState("idle");
  const [paymentIframeStatus, setPaymentIframeStatus] = useState("idle");
  const [sessionProbeKey, setSessionProbeKey] = useState(0);
  const [sessionProbeStatus, setSessionProbeStatus] = useState("idle");
  const [monitorClock, setMonitorClock] = useState(() => new Date());

  const paymentIframeContainerRef = useRef(null);
  const paymentIframeRef = useRef(null);
  const managerIframeRef = useRef(null);
  const previousVfConnectivityRef = useRef("unknown");

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

  const displayedSessionId =
    payNowResponse?.sessionId || vfReportedSessionId || payNowSessionId || "—";

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

      setLastVfActivityAt(new Date());
      setVfConnectivity("active");

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

      const messageSessionId = extractSessionIdFromMessage(data);
      if (messageSessionId) {
        setVfReportedSessionId(messageSessionId);
      }

      const payNowPayload = extractPayNowResponse(data);
      if (payNowPayload) {
        setPayNowResponse(payNowPayload);
        return;
      }

      if (data.gwMessageType === "PAYMENT_URL_PAYLOAD") {
        if (messageSessionId) {
          setPayNowSessionId(messageSessionId);
        }
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
    const parsed = parsePayNowSessionIdFromUrl(paymentIframeSrc);
    if (parsed) {
      setPayNowSessionId(parsed);
    }
  }, [paymentIframeSrc]);

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setMonitorClock(new Date());
    }, VF_SESSION_TICK_MS);
    return () => window.clearInterval(timerId);
  }, []);

  useEffect(() => {
    const probeTimerId = window.setInterval(() => {
      setSessionProbeStatus("checking");
      setSessionProbeKey((current) => current + 1);
    }, VF_SESSION_PROBE_MS);
    return () => window.clearInterval(probeTimerId);
  }, []);

  useEffect(() => {
    const iframesVisible =
      managerIframeStatus === "loaded" || paymentIframeStatus === "loaded";

    if (!iframesVisible) {
      setVfConnectivity("unknown");
      return;
    }

    if (sessionProbeStatus === "error") {
      setVfConnectivity("lost");
      return;
    }

    if (!lastVfActivityAt) {
      setVfConnectivity("warming");
      return;
    }

    const inactiveMs = Date.now() - lastVfActivityAt.getTime();
    if (inactiveMs > VF_SESSION_STALE_MS) {
      setVfConnectivity("stale");
      return;
    }

    setVfConnectivity("active");
  }, [
    lastVfActivityAt,
    managerIframeStatus,
    paymentIframeStatus,
    sessionProbeStatus,
    monitorClock,
  ]);

  useEffect(() => {
    const previous = previousVfConnectivityRef.current;
    if (previous !== "lost" && vfConnectivity === "lost") {
      showToast(
        "Salesforce iframe session may have been lost. Refresh and sign in to IAGIQA again.",
        "error"
      );
    }
    previousVfConnectivityRef.current = vfConnectivity;
  }, [vfConnectivity, showToast]);

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
    setPaymentIframeStatus("loaded");
    setLastVfActivityAt(new Date());
  };

  const handlePaymentIframeError = () => {
    setPaymentIframeStatus("error");
    setVfConnectivity("lost");
  };

  const handleManagerIframeLoad = () => {
    setManagerIframeStatus("loaded");
    setLastVfActivityAt(new Date());
  };

  const handleManagerIframeError = () => {
    setManagerIframeStatus("error");
    setVfConnectivity("lost");
  };

  const handleSessionProbeLoad = () => {
    setSessionProbeStatus("ok");
    setLastVfActivityAt(new Date());
  };

  const handleSessionProbeError = () => {
    setSessionProbeStatus("error");
    setVfConnectivity("lost");
  };

  const vfConnectivityColor =
    vfConnectivity === "active"
      ? "success.main"
      : vfConnectivity === "stale" || vfConnectivity === "warming"
        ? "warning.main"
        : vfConnectivity === "lost"
          ? "error.main"
          : "text.secondary";

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
      <Box
        sx={{
          position: "fixed",
          top: 12,
          right: 12,
          zIndex: 1400,
          width: { xs: "calc(100% - 24px)", sm: 360 },
          maxWidth: "100%",
        }}
      >
        <Paper
          elevation={6}
          sx={{
            p: 1.5,
            borderRadius: 2,
            border: "1px solid",
            borderColor: vfConnectivityColor,
            backgroundColor: "rgba(255,255,255,0.97)",
          }}
        >
          <Typography variant="caption" color="text.secondary" display="block">
            Session monitor (live)
          </Typography>
          <Typography variant="body2" sx={{ mt: 0.5, wordBreak: "break-all" }}>
            <strong>sessionId:</strong> {displayedSessionId}
          </Typography>
          <Typography variant="caption" display="block" sx={{ mt: 0.5 }}>
            <strong>VF link:</strong>{" "}
            <Box component="span" sx={{ color: vfConnectivityColor }}>
              {vfConnectivity}
            </Box>
          </Typography>
          <Typography variant="caption" display="block" color="text.secondary">
            Last VF activity: {formatClockTime(lastVfActivityAt)} · probe:{" "}
            {sessionProbeStatus}
          </Typography>
          <Typography variant="caption" display="block" color="text.secondary">
            Search iframe: {managerIframeStatus} · Payment iframe:{" "}
            {paymentIframeStatus}
          </Typography>
        </Paper>
      </Box>

      <iframe
        key={sessionProbeKey}
        title="Session probe"
        src={`${MANAGER_VF_URL}?sessionProbe=${sessionProbeKey}`}
        onLoad={handleSessionProbeLoad}
        onError={handleSessionProbeError}
        style={{
          position: "fixed",
          width: 0,
          height: 0,
          border: 0,
          opacity: 0,
          pointerEvents: "none",
        }}
      />

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
                  ref={managerIframeRef}
                  src={MANAGER_VF_URL}
                  width="100%"
                  height="500px"
                  style={{ border: "none" }}
                  title="Search Iframe"
                  onLoad={handleManagerIframeLoad}
                  onError={handleManagerIframeError}
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
                    onError={handlePaymentIframeError}
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
