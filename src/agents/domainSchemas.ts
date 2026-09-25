// Accepted manifest schemas for domain tool argument validation. Keep aligned with plugin.json.
export const domainSchemas = {
  "getWorkspaceState": {
    "type": "object",
    "properties": {},
    "additionalProperties": false
  },
  "searchInvoices": {
    "type": "object",
    "properties": {
      "query": {
        "type": "string"
      },
      "status": {
        "type": "string",
        "enum": [
          "all",
          "draft",
          "issued",
          "open",
          "sent",
          "overdue",
          "paid"
        ]
      },
      "clientId": {
        "type": "string"
      },
      "historicalOnly": {
        "type": "boolean"
      },
      "sortBy": {
        "type": "string",
        "enum": [
          "updatedAt",
          "invoiceDate",
          "number",
          "client"
        ]
      },
      "sortDirection": {
        "type": "string",
        "enum": [
          "ascending",
          "descending"
        ]
      },
      "cursor": {
        "type": "string"
      },
      "limit": {
        "type": "integer",
        "minimum": 1,
        "maximum": 100
      }
    },
    "additionalProperties": false
  },
  "getInvoice": {
    "type": "object",
    "properties": {
      "invoiceId": {
        "type": "string"
      },
      "versionId": {
        "type": "string",
        "description": "Optional retained issued version to inspect."
      },
      "includeCorrection": {
        "type": "boolean",
        "description": "Include the saved unpublished correction content, if present."
      }
    },
    "required": [
      "invoiceId"
    ],
    "additionalProperties": false
  },
  "searchClients": {
    "type": "object",
    "properties": {
      "query": {
        "type": "string"
      },
      "clientId": {
        "type": "string"
      },
      "cursor": {
        "type": "string"
      },
      "limit": {
        "type": "integer",
        "minimum": 1,
        "maximum": 100
      }
    },
    "additionalProperties": false
  },
  "saveClient": {
    "type": "object",
    "properties": {
      "clientId": {
        "type": "string",
        "description": "Omit to create a client."
      },
      "details": {
        "type": "object",
        "properties": {
          "name": {
            "type": "string"
          },
          "billingAddress": {
            "type": "string"
          },
          "contactName": {
            "type": "string"
          },
          "email": {
            "type": "string"
          },
          "phone": {
            "type": "string"
          },
          "taxIdentifier": {
            "type": "string"
          },
          "termsDays": {
            "type": "integer",
            "minimum": 0,
            "description": "Usual payment terms for this client, in days."
          },
          "currency": {
            "type": "string",
            "description": "Usual invoicing currency, an ISO 4217 code."
          }
        },
        "minProperties": 1,
        "additionalProperties": false
      }
    },
    "required": [
      "details"
    ],
    "additionalProperties": false
  },
  "updateBusinessIdentity": {
    "type": "object",
    "properties": {
      "details": {
        "type": "object",
        "properties": {
          "name": {
            "type": "string"
          },
          "address": {
            "type": "string"
          },
          "email": {
            "type": "string"
          },
          "phone": {
            "type": "string"
          },
          "website": {
            "type": "string"
          },
          "registrationIdentifier": {
            "type": "string"
          },
          "taxIdentifier": {
            "type": "string"
          },
          "defaultPaymentInstructions": {
            "type": "string"
          },
          "defaultTermsDays": {
            "type": "integer",
            "minimum": 0,
            "description": "Default payment terms for new drafts, in days."
          }
        },
        "minProperties": 1,
        "additionalProperties": false
      }
    },
    "required": [
      "details"
    ],
    "additionalProperties": false
  },
  "setNextInvoiceNumber": {
    "type": "object",
    "properties": {
      "nextNumber": {
        "type": "integer",
        "minimum": 1
      },
      "unregisteredHistoryChecked": {
        "type": "boolean",
        "const": true,
        "description": "The user has explicitly verified this starting point against invoices outside the archive."
      }
    },
    "required": [
      "nextNumber",
      "unregisteredHistoryChecked"
    ],
    "additionalProperties": false
  },
  "createInvoiceDraft": {
    "type": "object",
    "properties": {
      "sourceInvoiceId": {
        "type": "string"
      },
      "sourceVersionId": {
        "type": "string",
        "description": "Requires sourceInvoiceId."
      }
    },
    "dependentRequired": {
      "sourceVersionId": [
        "sourceInvoiceId"
      ]
    },
    "additionalProperties": false
  },
  "updateInvoiceDraft": {
    "type": "object",
    "properties": {
      "draftId": {
        "type": "string"
      },
      "changes": {
        "type": "object",
        "properties": {
          "sender": {
            "$ref": "#/$defs/partyPatch"
          },
          "recipient": {
            "$ref": "#/$defs/partyPatch"
          },
          "invoiceDate": {
            "type": [
              "string",
              "null"
            ],
            "format": "date"
          },
          "dueDate": {
            "type": [
              "string",
              "null"
            ],
            "format": "date"
          },
          "reference": {
            "type": "string"
          },
          "currency": {
            "type": [
              "string",
              "null"
            ],
            "pattern": "^[A-Z]{3}$"
          },
          "lineItems": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "description": {
                  "type": "string"
                },
                "quantity": {
                  "type": [
                    "number",
                    "null"
                  ],
                  "exclusiveMinimum": 0
                },
                "unitPrice": {
                  "type": [
                    "number",
                    "null"
                  ],
                  "minimum": 0
                },
                "discountPercent": {
                  "type": [
                    "number",
                    "null"
                  ],
                  "minimum": 0,
                  "maximum": 100
                },
                "taxPercent": {
                  "type": [
                    "number",
                    "null"
                  ],
                  "minimum": 0
                }
              },
              "required": [
                "description",
                "quantity",
                "unitPrice"
              ],
              "additionalProperties": false
            }
          },
          "notes": {
            "type": "string"
          },
          "paymentInstructions": {
            "type": "string"
          },
          "termsDays": {
            "type": [
              "integer",
              "null"
            ],
            "minimum": 0,
            "description": "Payment terms in days after the invoice date; the due date follows while set. Null means a custom due date."
          }
        },
        "minProperties": 1,
        "additionalProperties": false
      }
    },
    "required": [
      "draftId",
      "changes"
    ],
    "additionalProperties": false,
    "$defs": {
      "partyPatch": {
        "type": "object",
        "properties": {
          "name": {
            "type": "string"
          },
          "address": {
            "type": "string"
          },
          "contactName": {
            "type": "string"
          },
          "email": {
            "type": "string"
          },
          "phone": {
            "type": "string"
          },
          "website": {
            "type": "string"
          },
          "registrationIdentifier": {
            "type": "string"
          },
          "taxIdentifier": {
            "type": "string"
          }
        },
        "minProperties": 1,
        "additionalProperties": false
      }
    }
  },
  "applyDefaultsToDraft": {
    "type": "object",
    "properties": {
      "draftId": {
        "type": "string"
      },
      "sources": {
        "type": "array",
        "items": {
          "type": "string",
          "enum": [
            "businessIdentity",
            "paymentInstructions",
            "template",
            "client"
          ]
        },
        "minItems": 1,
        "uniqueItems": true
      },
      "clientId": {
        "type": "string",
        "description": "Required when sources includes client."
      }
    },
    "required": [
      "draftId",
      "sources"
    ],
    "additionalProperties": false
  },
  "updatePresentation": {
    "type": "object",
    "properties": {
      "target": {
        "oneOf": [
          {
            "type": "object",
            "properties": {
              "kind": {
                "const": "defaultTemplate"
              }
            },
            "required": [
              "kind"
            ],
            "additionalProperties": false
          },
          {
            "type": "object",
            "properties": {
              "kind": {
                "const": "draft"
              },
              "draftId": {
                "type": "string"
              }
            },
            "required": [
              "kind",
              "draftId"
            ],
            "additionalProperties": false
          }
        ]
      },
      "settings": {
        "type": "object",
        "properties": {
          "logoAssetId": {
            "type": [
              "string",
              "null"
            ],
            "description": "Uploaded image ID, or null to remove the logo."
          },
          "logoWidthMm": {
            "type": "number",
            "exclusiveMinimum": 0
          },
          "logoPlacement": {
            "enum": [
              "left",
              "center",
              "right"
            ]
          },
          "letterheadText": {
            "type": "string"
          },
          "letterheadAlignment": {
            "enum": [
              "left",
              "center",
              "right"
            ]
          },
          "letterheadTextSizePt": {
            "type": "number",
            "exclusiveMinimum": 0
          },
          "footerText": {
            "type": "string"
          },
          "footerAlignment": {
            "enum": [
              "left",
              "center",
              "right"
            ]
          },
          "footerTextSizePt": {
            "type": "number",
            "exclusiveMinimum": 0
          },
          "typeStyle": {
            "type": "string",
            "description": "A supported type-style identifier returned by getWorkspaceState."
          },
          "bodyTextSizePt": {
            "type": "number",
            "exclusiveMinimum": 0
          },
          "lineSpacing": {
            "type": "number",
            "exclusiveMinimum": 0
          },
          "sectionSpacingMm": {
            "type": "number",
            "minimum": 0
          },
          "accentColor": {
            "type": "string",
            "pattern": "^#[0-9A-Fa-f]{6}$"
          },
          "pageSize": {
            "type": "string",
            "description": "A supported page-size identifier returned by getWorkspaceState."
          },
          "marginsMm": {
            "type": "object",
            "properties": {
              "top": {
                "type": "number",
                "minimum": 0
              },
              "right": {
                "type": "number",
                "minimum": 0
              },
              "bottom": {
                "type": "number",
                "minimum": 0
              },
              "left": {
                "type": "number",
                "minimum": 0
              }
            },
            "required": [
              "top",
              "right",
              "bottom",
              "left"
            ],
            "additionalProperties": false
          },
          "showPageNumbers": {
            "type": "boolean"
          }
        },
        "minProperties": 1,
        "additionalProperties": false
      }
    },
    "required": [
      "target",
      "settings"
    ],
    "additionalProperties": false
  },
  "saveDraftPresentationAsDefault": {
    "type": "object",
    "properties": {
      "draftId": {
        "type": "string"
      }
    },
    "required": [
      "draftId"
    ],
    "additionalProperties": false
  },
  "getInvoicePreview": {
    "type": "object",
    "properties": {
      "target": {
        "oneOf": [
          {
            "type": "object",
            "properties": {
              "draftId": {
                "type": "string"
              }
            },
            "required": [
              "draftId"
            ],
            "additionalProperties": false
          },
          {
            "type": "object",
            "properties": {
              "invoiceId": {
                "type": "string"
              },
              "versionId": {
                "type": "string",
                "description": "Omit for the current issued version."
              }
            },
            "required": [
              "invoiceId"
            ],
            "additionalProperties": false
          }
        ]
      },
      "pageNumbers": {
        "type": "array",
        "items": {
          "type": "integer",
          "minimum": 1
        },
        "minItems": 1,
        "uniqueItems": true
      }
    },
    "required": [
      "target"
    ],
    "additionalProperties": false
  },
  "startInvoiceCorrection": {
    "type": "object",
    "properties": {
      "invoiceId": {
        "type": "string"
      }
    },
    "required": [
      "invoiceId"
    ],
    "additionalProperties": false
  },
  "prepareInvoiceFinalization": {
    "type": "object",
    "properties": {
      "draftId": {
        "type": "string"
      },
      "action": {
        "oneOf": [
          {
            "type": "object",
            "properties": {
              "kind": {
                "const": "issue"
              }
            },
            "required": [
              "kind"
            ],
            "additionalProperties": false
          },
          {
            "type": "object",
            "properties": {
              "kind": {
                "const": "publishCorrection"
              },
              "changeNote": {
                "type": "string",
                "minLength": 1
              }
            },
            "required": [
              "kind",
              "changeNote"
            ],
            "additionalProperties": false
          },
          {
            "type": "object",
            "properties": {
              "kind": {
                "const": "registerHistorical"
              },
              "originalNumber": {
                "type": "integer",
                "minimum": 1
              },
              "originalPdfAssetId": {
                "type": "string",
                "description": "Optional uploaded original PDF, retained as an unverified historical reference."
              }
            },
            "required": [
              "kind",
              "originalNumber"
            ],
            "additionalProperties": false
          }
        ]
      }
    },
    "required": [
      "draftId",
      "action"
    ],
    "additionalProperties": false
  },
  "finalizeInvoice": {
    "type": "object",
    "properties": {
      "confirmationToken": {
        "type": "string"
      }
    },
    "required": [
      "confirmationToken"
    ],
    "additionalProperties": false
  },
  "discardInvoiceDraft": {
    "type": "object",
    "properties": {
      "draftId": {
        "type": "string"
      }
    },
    "required": [
      "draftId"
    ],
    "additionalProperties": false
  },
  "exportInvoicePdf": {
    "type": "object",
    "properties": {
      "invoiceId": {
        "type": "string"
      },
      "request": {
        "oneOf": [
          {
            "type": "object",
            "properties": {
              "kind": {
                "const": "downloadVersion"
              },
              "versionId": {
                "type": "string",
                "description": "Omit for the current issued version."
              }
            },
            "required": [
              "kind"
            ],
            "additionalProperties": false
          },
          {
            "type": "object",
            "properties": {
              "kind": {
                "const": "downloadHistoricalReference"
              }
            },
            "required": [
              "kind"
            ],
            "additionalProperties": false
          },
          {
            "type": "object",
            "properties": {
              "kind": {
                "const": "reissue"
              }
            },
            "required": [
              "kind"
            ],
            "additionalProperties": false
          }
        ]
      }
    },
    "required": [
      "invoiceId",
      "request"
    ],
    "additionalProperties": false
  },
  "setHistoricalPdfReference": {
    "type": "object",
    "properties": {
      "invoiceId": {
        "type": "string"
      },
      "pdfAssetId": {
        "type": [
          "string",
          "null"
        ],
        "description": "Uploaded PDF ID, or null to remove the historical reference."
      }
    },
    "required": [
      "invoiceId",
      "pdfAssetId"
    ],
    "additionalProperties": false
  },
  "addInvoiceNote": {
    "type": "object",
    "properties": {
      "invoiceId": {
        "type": "string"
      },
      "text": {
        "type": "string",
        "description": "The note, e.g. 'Send the corrected PDF to Book Sprints'."
      }
    },
    "required": [
      "invoiceId",
      "text"
    ],
    "additionalProperties": false
  },
  "updateInvoiceNote": {
    "type": "object",
    "properties": {
      "invoiceId": {
        "type": "string"
      },
      "noteId": {
        "type": "string"
      },
      "done": {
        "type": "boolean",
        "description": "true ticks the note off, false reopens it."
      },
      "text": {
        "type": "string"
      },
      "remove": {
        "type": "boolean"
      }
    },
    "required": [
      "invoiceId",
      "noteId"
    ],
    "additionalProperties": false
  },
  "linkDocument": {
    "type": "object",
    "properties": {
      "agreementId": {
        "type": "string",
        "description": "Link to this agreement."
      },
      "contractorId": {
        "type": "string",
        "description": "Link to this contractor."
      },
      "clientId": {
        "type": "string",
        "description": "Link to this client (give clientId or invoiceId, not both)."
      },
      "invoiceId": {
        "type": "string",
        "description": "Link to this issued invoice."
      },
      "path": {
        "type": "string",
        "description": "Absolute path of the file; it stays where it is."
      },
      "kind": {
        "type": "string",
        "enum": [
          "contract",
          "sow",
          "purchase-order",
          "other"
        ]
      },
      "name": {
        "type": "string",
        "description": "Display name; defaults to the file name."
      }
    },
    "required": [
      "path"
    ],
    "additionalProperties": false
  },
  "unlinkDocument": {
    "type": "object",
    "properties": {
      "agreementId": {
        "type": "string",
        "description": "Link to this agreement."
      },
      "contractorId": {
        "type": "string",
        "description": "Link to this contractor."
      },
      "clientId": {
        "type": "string"
      },
      "invoiceId": {
        "type": "string"
      },
      "documentId": {
        "type": "string"
      }
    },
    "required": [
      "documentId"
    ],
    "additionalProperties": false
  },
  "markInvoice": {
    "type": "object",
    "properties": {
      "invoiceId": {
        "type": "string"
      },
      "mark": {
        "oneOf": [
          {
            "type": "object",
            "properties": {
              "kind": {
                "const": "sent"
              },
              "at": {
                "type": "string",
                "description": "ISO date, defaults to today."
              },
              "to": {
                "type": "string",
                "description": "Who it went to."
              }
            },
            "required": [
              "kind"
            ],
            "additionalProperties": false
          },
          {
            "type": "object",
            "properties": {
              "kind": {
                "const": "paid"
              },
              "at": {
                "type": "string",
                "description": "ISO date, defaults to today."
              },
              "reference": {
                "type": "string",
                "description": "Payment reference."
              },
              "note": {
                "type": "string",
                "description": "Free note about the payment, e.g. part-paid or paid by a parent company."
              }
            },
            "required": [
              "kind"
            ],
            "additionalProperties": false
          },
          {
            "type": "object",
            "properties": {
              "kind": {
                "const": "clear"
              },
              "which": {
                "type": "string",
                "enum": [
                  "sent",
                  "paid"
                ]
              }
            },
            "required": [
              "kind",
              "which"
            ],
            "additionalProperties": false
          }
        ]
      }
    },
    "required": [
      "invoiceId",
      "mark"
    ],
    "additionalProperties": false
  },
  "setNumberFormat": {
    "type": "object",
    "properties": {
      "pattern": {
        "type": "string",
        "minLength": 1
      }
    },
    "required": [
      "pattern"
    ],
    "additionalProperties": false
  },
  "previewInvoiceImport": {
    "type": "object",
    "properties": {
      "source": {
        "oneOf": [
          {
            "type": "object",
            "properties": {
              "path": {
                "type": "string",
                "description": "Absolute path of a pure-invoicing/1 JSON file; PDFs in it resolve relative to this file."
              }
            },
            "required": [
              "path"
            ],
            "additionalProperties": false
          },
          {
            "type": "object",
            "properties": {
              "document": {
                "type": "object",
                "description": "The pure-invoicing/1 document itself, assembled by you (no PDFs are retained this way)."
              }
            },
            "required": [
              "document"
            ],
            "additionalProperties": false
          }
        ]
      },
      "skipConflicts": {
        "type": "boolean",
        "description": "Plan around rows whose counter is already in the archive instead of failing."
      }
    },
    "required": [
      "source"
    ],
    "additionalProperties": false
  },
  "importInvoices": {
    "type": "object",
    "properties": {
      "source": {
        "oneOf": [
          {
            "type": "object",
            "properties": {
              "path": {
                "type": "string",
                "description": "Absolute path of a pure-invoicing/1 JSON file; PDFs in it resolve relative to this file."
              }
            },
            "required": [
              "path"
            ],
            "additionalProperties": false
          },
          {
            "type": "object",
            "properties": {
              "document": {
                "type": "object",
                "description": "The pure-invoicing/1 document itself, assembled by you (no PDFs are retained this way)."
              }
            },
            "required": [
              "document"
            ],
            "additionalProperties": false
          }
        ]
      },
      "skipConflicts": {
        "type": "boolean"
      }
    },
    "required": [
      "source"
    ],
    "additionalProperties": false
  },
  "listAgreements": {
    "type": "object",
    "properties": {
      "status": {
        "type": "string",
        "enum": [
          "all",
          "draft",
          "sent",
          "signed",
          "complete",
          "ended"
        ]
      },
      "direction": {
        "type": "string",
        "enum": [
          "client",
          "contractor"
        ]
      },
      "clientId": {
        "type": "string"
      },
      "contractorId": {
        "type": "string"
      },
      "query": {
        "type": "string"
      }
    },
    "required": [],
    "additionalProperties": false
  },
  "getAgreement": {
    "type": "object",
    "properties": {
      "agreementId": {
        "type": "string",
        "description": "The agreement's id (from listAgreements)."
      }
    },
    "required": [
      "agreementId"
    ],
    "additionalProperties": false
  },
  "createAgreement": {
    "type": "object",
    "properties": {
      "kind": {
        "type": "string",
        "enum": [
          "msa",
          "sow",
          "change-order",
          "nda",
          "contractor"
        ]
      },
      "direction": {
        "type": "string",
        "enum": [
          "client",
          "contractor"
        ],
        "description": "client: Pure Science does the work and invoices. contractor: someone works for Pure Science and bills it."
      },
      "clientId": {
        "type": "string"
      },
      "contractorId": {
        "type": "string"
      },
      "parentId": {
        "type": "string",
        "description": "The MSA a SOW sits under, or the agreement a change order amends (required for change orders)."
      },
      "title": {
        "type": "string"
      },
      "startFrom": {
        "type": "object",
        "properties": {
          "kind": {
            "type": "string",
            "enum": [
              "skeleton",
              "template",
              "copy"
            ]
          },
          "agreementId": {
            "type": "string",
            "description": "For copy: the agreement whose structure to reuse."
          }
        },
        "required": [
          "kind"
        ],
        "additionalProperties": false
      },
      "registered": {
        "type": "object",
        "description": "Record an agreement already signed elsewhere, with its own number and signing date; it is created active with no text.",
        "properties": {
          "numberText": {
            "type": "string"
          },
          "signedAt": {
            "type": "string",
            "description": "YYYY-MM-DD"
          },
          "signedPdfPath": {
            "type": "string"
          }
        },
        "required": [
          "numberText",
          "signedAt"
        ],
        "additionalProperties": false
      }
    },
    "required": [
      "kind",
      "direction"
    ],
    "additionalProperties": false
  },
  "updateAgreement": {
    "type": "object",
    "properties": {
      "agreementId": {
        "type": "string",
        "description": "The agreement's id (from listAgreements)."
      },
      "changes": {
        "type": "object",
        "properties": {
          "title": {
            "type": "string"
          },
          "currency": {
            "type": "string"
          },
          "paymentDays": {
            "type": [
              "integer",
              "null"
            ]
          },
          "startDate": {
            "type": [
              "string",
              "null"
            ]
          },
          "endDate": {
            "type": [
              "string",
              "null"
            ]
          },
          "parentId": {
            "type": [
              "string",
              "null"
            ]
          },
          "fee": {
            "type": "object",
            "properties": {
              "kind": {
                "type": "string",
                "enum": [
                  "fixed",
                  "monthly",
                  "hourly",
                  "none"
                ]
              },
              "amount": {
                "type": "number"
              },
              "rate": {
                "type": "number"
              },
              "cap": {
                "type": "number",
                "description": "Monthly cap for hourly work."
              }
            },
            "required": [
              "kind"
            ],
            "additionalProperties": false
          },
          "sections": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "id": {
                  "type": "string"
                },
                "heading": {
                  "type": "string"
                },
                "body": {
                  "type": "string"
                }
              },
              "required": [
                "heading",
                "body"
              ],
              "additionalProperties": false
            },
            "description": "Replaces all sections, in order."
          },
          "milestones": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "id": {
                  "type": "string",
                  "description": "Keep an existing milestone's id to change it; omit for a new one."
                },
                "label": {
                  "type": "string"
                },
                "amount": {
                  "type": "number"
                },
                "trigger": {
                  "type": "string",
                  "enum": [
                    "signature",
                    "done",
                    "acceptance"
                  ]
                }
              },
              "required": [
                "label",
                "amount",
                "trigger"
              ],
              "additionalProperties": false
            },
            "description": "Replaces the planned payment milestones; for a fixed fee they must add up to it. Invoiced milestones cannot change amount or be removed."
          }
        },
        "additionalProperties": false
      }
    },
    "required": [
      "agreementId",
      "changes"
    ],
    "additionalProperties": false
  },
  "editAgreementSection": {
    "type": "object",
    "properties": {
      "agreementId": {
        "type": "string",
        "description": "The agreement's id (from listAgreements)."
      },
      "sectionId": {
        "type": "string",
        "description": "Omit to add a new section."
      },
      "heading": {
        "type": "string"
      },
      "body": {
        "type": "string",
        "description": "Plain text; blank lines separate paragraphs, lines starting '- ' make a list. Keep [bracketed] placeholders for facts you do not know."
      },
      "remove": {
        "type": "boolean"
      },
      "afterSectionId": {
        "type": "string"
      }
    },
    "required": [
      "agreementId"
    ],
    "additionalProperties": false
  },
  "sendAgreement": {
    "type": "object",
    "properties": {
      "agreementId": {
        "type": "string",
        "description": "The agreement's id (from listAgreements)."
      }
    },
    "required": [
      "agreementId"
    ],
    "additionalProperties": false
  },
  "withdrawAgreement": {
    "type": "object",
    "properties": {
      "agreementId": {
        "type": "string",
        "description": "The agreement's id (from listAgreements)."
      }
    },
    "required": [
      "agreementId"
    ],
    "additionalProperties": false
  },
  "markAgreementSigned": {
    "type": "object",
    "properties": {
      "agreementId": {
        "type": "string",
        "description": "The agreement's id (from listAgreements)."
      },
      "ours": {
        "type": "object",
        "properties": {
          "name": {
            "type": "string"
          },
          "at": {
            "type": "string",
            "description": "YYYY-MM-DD"
          }
        },
        "required": [
          "name",
          "at"
        ],
        "additionalProperties": false
      },
      "theirs": {
        "type": "object",
        "properties": {
          "name": {
            "type": "string"
          },
          "at": {
            "type": "string",
            "description": "YYYY-MM-DD"
          }
        },
        "required": [
          "name",
          "at"
        ],
        "additionalProperties": false
      },
      "signedPdfPath": {
        "type": "string",
        "description": "The signed PDF's path, linked not copied."
      }
    },
    "required": [
      "agreementId",
      "ours",
      "theirs"
    ],
    "additionalProperties": false
  },
  "closeAgreement": {
    "type": "object",
    "properties": {
      "agreementId": {
        "type": "string",
        "description": "The agreement's id (from listAgreements)."
      },
      "how": {
        "type": "string",
        "enum": [
          "complete",
          "ended"
        ]
      }
    },
    "required": [
      "agreementId",
      "how"
    ],
    "additionalProperties": false
  },
  "reopenAgreement": {
    "type": "object",
    "properties": {
      "agreementId": {
        "type": "string",
        "description": "The agreement's id (from listAgreements)."
      }
    },
    "required": [
      "agreementId"
    ],
    "additionalProperties": false
  },
  "setMilestoneDone": {
    "type": "object",
    "properties": {
      "agreementId": {
        "type": "string",
        "description": "The agreement's id (from listAgreements)."
      },
      "milestoneId": {
        "type": "string"
      },
      "done": {
        "type": "boolean"
      }
    },
    "required": [
      "agreementId",
      "milestoneId",
      "done"
    ],
    "additionalProperties": false
  },
  "invoiceAgreementMilestone": {
    "type": "object",
    "properties": {
      "agreementId": {
        "type": "string",
        "description": "The agreement's id (from listAgreements)."
      },
      "milestoneId": {
        "type": "string"
      }
    },
    "required": [
      "agreementId",
      "milestoneId"
    ],
    "additionalProperties": false
  },
  "invoiceAgreementMonth": {
    "type": "object",
    "properties": {
      "agreementId": {
        "type": "string",
        "description": "The agreement's id (from listAgreements)."
      },
      "period": {
        "type": "string",
        "description": "The month, YYYY-MM."
      }
    },
    "required": [
      "agreementId",
      "period"
    ],
    "additionalProperties": false
  },
  "linkInvoiceToAgreement": {
    "type": "object",
    "properties": {
      "agreementId": {
        "type": "string",
        "description": "The agreement's id (from listAgreements)."
      },
      "invoiceId": {
        "type": "string"
      },
      "link": {
        "type": "boolean",
        "description": "false unlinks."
      }
    },
    "required": [
      "agreementId",
      "invoiceId"
    ],
    "additionalProperties": false
  },
  "addContractorBill": {
    "type": "object",
    "properties": {
      "agreementId": {
        "type": "string",
        "description": "The agreement's id (from listAgreements)."
      },
      "reference": {
        "type": "string",
        "description": "Their invoice number."
      },
      "period": {
        "type": "string",
        "description": "Month billed, YYYY-MM."
      },
      "amount": {
        "type": "number"
      },
      "hours": {
        "type": "number"
      },
      "receivedAt": {
        "type": "string",
        "description": "YYYY-MM-DD"
      },
      "path": {
        "type": "string",
        "description": "The bill's PDF, linked by path."
      }
    },
    "required": [
      "agreementId",
      "reference",
      "period",
      "amount"
    ],
    "additionalProperties": false
  },
  "updateContractorBill": {
    "type": "object",
    "properties": {
      "agreementId": {
        "type": "string",
        "description": "The agreement's id (from listAgreements)."
      },
      "billId": {
        "type": "string"
      },
      "paidAt": {
        "type": [
          "string",
          "null"
        ],
        "description": "YYYY-MM-DD, or null to clear."
      },
      "approvedOverCap": {
        "type": "boolean"
      },
      "remove": {
        "type": "boolean"
      }
    },
    "required": [
      "agreementId",
      "billId"
    ],
    "additionalProperties": false
  },
  "searchContractors": {
    "type": "object",
    "properties": {
      "query": {
        "type": "string"
      }
    },
    "required": [],
    "additionalProperties": false
  },
  "saveContractor": {
    "type": "object",
    "properties": {
      "contractorId": {
        "type": "string",
        "description": "Omit to create."
      },
      "details": {
        "type": "object",
        "properties": {
          "name": {
            "type": "string"
          },
          "contactName": {
            "type": "string"
          },
          "email": {
            "type": "string"
          },
          "address": {
            "type": "string"
          },
          "taxIdentifier": {
            "type": "string"
          },
          "currency": {
            "type": "string"
          }
        },
        "additionalProperties": false
      }
    },
    "required": [
      "details"
    ],
    "additionalProperties": false
  },
  "listAgreementTemplates": {
    "type": "object",
    "properties": {
      "kind": {
        "type": "string",
        "enum": [
          "msa",
          "sow",
          "change-order",
          "nda",
          "contractor"
        ]
      },
      "direction": {
        "type": "string",
        "enum": [
          "client",
          "contractor"
        ]
      }
    },
    "required": [],
    "additionalProperties": false
  },
  "getAgreementTemplate": {
    "type": "object",
    "properties": {
      "templateId": {
        "type": "string",
        "description": "The template's id (from listAgreementTemplates)."
      }
    },
    "required": [
      "templateId"
    ],
    "additionalProperties": false
  },
  "saveAgreementTemplate": {
    "type": "object",
    "properties": {
      "templateId": {
        "type": "string",
        "description": "Omit to create a new one."
      },
      "template": {
        "type": "object",
        "properties": {
          "name": {
            "type": "string"
          },
          "description": {
            "type": "string"
          },
          "kind": {
            "type": "string",
            "enum": [
              "msa",
              "sow",
              "change-order",
              "nda",
              "contractor"
            ]
          },
          "direction": {
            "type": "string",
            "enum": [
              "client",
              "contractor"
            ]
          },
          "title": {
            "type": "string",
            "description": "The title with fields, e.g. Statement of Work #{{sequence}} — {{project}}."
          },
          "sections": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "heading": {
                  "type": "string"
                },
                "body": {
                  "type": "string"
                }
              },
              "required": [
                "heading",
                "body"
              ],
              "additionalProperties": false
            }
          },
          "fields": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "key": {
                  "type": "string",
                  "description": "Letters and digits; written {{key}} in the wording."
                },
                "label": {
                  "type": "string"
                },
                "source": {
                  "type": "string",
                  "enum": [
                    "party",
                    "partyContact",
                    "business",
                    "parentTitle",
                    "parentNumber",
                    "parentDate",
                    "paymentDays",
                    "sequence",
                    "today",
                    "ask"
                  ],
                  "description": "Where the value comes from; ask means it is asked when the template is used."
                },
                "type": {
                  "type": "string",
                  "enum": [
                    "text",
                    "number",
                    "money",
                    "date"
                  ]
                },
                "default": {
                  "type": "string"
                }
              },
              "required": [
                "key",
                "label",
                "source"
              ],
              "additionalProperties": false
            }
          },
          "fee": {
            "type": "object",
            "properties": {
              "kind": {
                "type": "string",
                "enum": [
                  "fixed",
                  "monthly",
                  "hourly",
                  "none"
                ]
              },
              "amountField": {
                "type": "string"
              },
              "rateField": {
                "type": "string"
              },
              "capField": {
                "type": "string"
              }
            },
            "required": [
              "kind"
            ],
            "additionalProperties": false
          },
          "milestones": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "label": {
                  "type": "string"
                },
                "share": {
                  "type": "number",
                  "description": "Percent of the fixed fee; all add up to 100."
                },
                "trigger": {
                  "type": "string",
                  "enum": [
                    "signature",
                    "done",
                    "acceptance"
                  ]
                }
              },
              "required": [
                "label",
                "share",
                "trigger"
              ],
              "additionalProperties": false
            }
          },
          "paymentDays": {
            "description": "A number of days, or 'parent' (from the agreement it sits under, else the client) or 'client'.",
            "oneOf": [
              {
                "type": "integer"
              },
              {
                "type": "string",
                "enum": [
                  "parent",
                  "client"
                ]
              }
            ]
          },
          "isDefault": {
            "type": "boolean"
          },
          "origin": {
            "type": "string"
          }
        },
        "required": [
          "name",
          "kind",
          "direction",
          "title",
          "sections",
          "fields",
          "fee",
          "milestones"
        ],
        "additionalProperties": false
      }
    },
    "required": [
      "template"
    ],
    "additionalProperties": false
  },
  "editTemplateSection": {
    "type": "object",
    "properties": {
      "templateId": {
        "type": "string",
        "description": "The template's id (from listAgreementTemplates)."
      },
      "index": {
        "type": "integer",
        "description": "Section position from 0; omit to add a section."
      },
      "heading": {
        "type": "string"
      },
      "body": {
        "type": "string",
        "description": "Wording with {{fields}} and [prompts]."
      },
      "remove": {
        "type": "boolean"
      }
    },
    "required": [
      "templateId"
    ],
    "additionalProperties": false
  },
  "deleteAgreementTemplate": {
    "type": "object",
    "properties": {
      "templateId": {
        "type": "string",
        "description": "The template's id (from listAgreementTemplates)."
      }
    },
    "required": [
      "templateId"
    ],
    "additionalProperties": false
  },
  "findAgreementSpecifics": {
    "type": "object",
    "properties": {
      "agreementId": {
        "type": "string"
      },
      "extraPhrases": {
        "type": "array",
        "items": {
          "type": "string"
        },
        "description": "Other phrases to offer as prompts."
      }
    },
    "required": [
      "agreementId"
    ],
    "additionalProperties": false
  },
  "makeTemplateFromAgreement": {
    "type": "object",
    "properties": {
      "agreementId": {
        "type": "string"
      },
      "name": {
        "type": "string"
      },
      "description": {
        "type": "string"
      },
      "choices": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "text": {
              "type": "string"
            },
            "becomes": {
              "type": "object",
              "description": "What the text becomes: {as:'field', key, label, source, type?}, {as:'prompt', label} or {as:'keep'}.",
              "properties": {
                "as": {
                  "type": "string",
                  "enum": [
                    "field",
                    "prompt",
                    "keep"
                  ]
                },
                "key": {
                  "type": "string"
                },
                "label": {
                  "type": "string"
                },
                "source": {
                  "type": "string",
                  "enum": [
                    "party",
                    "partyContact",
                    "business",
                    "parentTitle",
                    "parentNumber",
                    "parentDate",
                    "paymentDays",
                    "sequence",
                    "today",
                    "ask"
                  ],
                  "description": "Where the value comes from; ask means it is asked when the template is used."
                },
                "type": {
                  "type": "string",
                  "enum": [
                    "text",
                    "number",
                    "money",
                    "date"
                  ]
                }
              },
              "required": [
                "as"
              ],
              "additionalProperties": false
            }
          },
          "required": [
            "text",
            "becomes"
          ],
          "additionalProperties": false
        }
      }
    },
    "required": [
      "agreementId",
      "name",
      "choices"
    ],
    "additionalProperties": false
  },
  "createOutlineTemplate": {
    "type": "object",
    "properties": {
      "kind": {
        "type": "string",
        "enum": [
          "msa",
          "sow",
          "change-order",
          "nda",
          "contractor"
        ]
      },
      "direction": {
        "type": "string",
        "enum": [
          "client",
          "contractor"
        ]
      },
      "name": {
        "type": "string"
      }
    },
    "required": [
      "kind",
      "direction"
    ],
    "additionalProperties": false
  },
  "previewAgreementFromTemplate": {
    "type": "object",
    "properties": {
      "templateId": {
        "type": "string",
        "description": "The template's id (from listAgreementTemplates)."
      },
      "clientId": {
        "type": "string"
      },
      "contractorId": {
        "type": "string"
      },
      "parentId": {
        "type": "string",
        "description": "The MSA a SOW sits under, or the agreement a change order amends."
      },
      "answers": {
        "type": "object",
        "description": "Answers to the template's asked fields, by key."
      }
    },
    "required": [
      "templateId"
    ],
    "additionalProperties": false
  },
  "createAgreementFromTemplate": {
    "type": "object",
    "properties": {
      "templateId": {
        "type": "string",
        "description": "The template's id (from listAgreementTemplates)."
      },
      "clientId": {
        "type": "string"
      },
      "contractorId": {
        "type": "string"
      },
      "parentId": {
        "type": "string",
        "description": "The MSA a SOW sits under, or the agreement a change order amends."
      },
      "answers": {
        "type": "object",
        "description": "Answers to the template's asked fields, by key."
      }
    },
    "required": [
      "templateId"
    ],
    "additionalProperties": false
  },
  "discardAgreement": {
    "type": "object",
    "properties": {
      "agreementId": {
        "type": "string",
        "description": "The agreement's id (from listAgreements)."
      }
    },
    "required": [
      "agreementId"
    ],
    "additionalProperties": false
  },
  "addAgreementNote": {
    "type": "object",
    "properties": {
      "agreementId": {
        "type": "string",
        "description": "The agreement's id (from listAgreements)."
      },
      "text": {
        "type": "string"
      }
    },
    "required": [
      "agreementId",
      "text"
    ],
    "additionalProperties": false
  },
  "updateAgreementNote": {
    "type": "object",
    "properties": {
      "agreementId": {
        "type": "string",
        "description": "The agreement's id (from listAgreements)."
      },
      "noteId": {
        "type": "string"
      },
      "done": {
        "type": "boolean"
      },
      "text": {
        "type": "string"
      },
      "remove": {
        "type": "boolean"
      }
    },
    "required": [
      "agreementId",
      "noteId"
    ],
    "additionalProperties": false
  },
  "exportAgreementPdf": {
    "type": "object",
    "properties": {
      "agreementId": {
        "type": "string",
        "description": "The agreement's id (from listAgreements)."
      }
    },
    "required": [
      "agreementId"
    ],
    "additionalProperties": false
  },
} as const
