/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/smartcontracts.json`.
 */
export type Smartcontracts = {
  "address": "FCfqU7hKCSZGkmPiVqZqhjq2v585uwPM4VvieqgnJm2j",
  "metadata": {
    "name": "smartcontracts",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "approveTraditionalLoan",
      "discriminator": [
        154,
        19,
        129,
        184,
        36,
        247,
        94,
        126
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true,
          "relations": [
            "vault"
          ]
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "loan",
          "writable": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "principal",
          "type": "u64"
        },
        {
          "name": "fixedRateBps",
          "type": "u16"
        },
        {
          "name": "collateralUsdc",
          "type": "u64"
        },
        {
          "name": "hybridDefiPct",
          "type": "u8"
        },
        {
          "name": "hybridTradPct",
          "type": "u8"
        },
        {
          "name": "defiRateBps",
          "type": "u16"
        },
        {
          "name": "tradRateBps",
          "type": "u16"
        },
        {
          "name": "installments",
          "type": {
            "vec": {
              "defined": {
                "name": "installmentInput"
              }
            }
          }
        }
      ]
    },
    {
      "name": "closeLoan",
      "discriminator": [
        96,
        114,
        111,
        204,
        149,
        228,
        235,
        124
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true,
          "relations": [
            "vault"
          ]
        },
        {
          "name": "vault",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          },
          "relations": [
            "loan"
          ]
        },
        {
          "name": "loan",
          "writable": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "depositSol",
      "discriminator": [
        108,
        81,
        78,
        117,
        125,
        155,
        56,
        200
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true,
          "relations": [
            "vault"
          ]
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "depositUsdc",
      "discriminator": [
        184,
        148,
        250,
        169,
        224,
        213,
        34,
        126
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true,
          "relations": [
            "vault"
          ]
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "usdcMint",
          "docs": [
            "USDC mint — required for transfer_checked"
          ]
        },
        {
          "name": "userUsdcAta",
          "docs": [
            "User's USDC token account (source)"
          ],
          "writable": true
        },
        {
          "name": "vaultUsdcAta",
          "docs": [
            "Vault's USDC token account (destination — authority is vault PDA)"
          ],
          "writable": true
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "disburseTraditional",
      "discriminator": [
        67,
        14,
        89,
        136,
        165,
        183,
        170,
        136
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true,
          "relations": [
            "vault"
          ]
        },
        {
          "name": "vault",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          },
          "relations": [
            "loan"
          ]
        },
        {
          "name": "loan",
          "writable": true
        },
        {
          "name": "bankPool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  97,
                  110,
                  107,
                  45,
                  112,
                  111,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "usdcMint",
          "docs": [
            "USDC mint — required for transfer_checked"
          ]
        },
        {
          "name": "bankPoolUsdcAta",
          "docs": [
            "BankPool's USDC ATA (source of funds)"
          ],
          "writable": true
        },
        {
          "name": "userUsdcAta",
          "docs": [
            "User's USDC ATA (destination)"
          ],
          "writable": true
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": []
    },
    {
      "name": "initializeBankPool",
      "discriminator": [
        62,
        69,
        79,
        179,
        24,
        219,
        162,
        174
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "bankPool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  97,
                  110,
                  107,
                  45,
                  112,
                  111,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "initializeVault",
      "discriminator": [
        48,
        191,
        163,
        44,
        71,
        129,
        63,
        164
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "liquidate",
      "discriminator": [
        223,
        179,
        226,
        125,
        48,
        46,
        39,
        74
      ],
      "accounts": [
        {
          "name": "liquidator",
          "writable": true,
          "signer": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "vault.owner",
                "account": "userVault"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "openDefiLoan",
      "discriminator": [
        45,
        161,
        253,
        152,
        10,
        109,
        241,
        47
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true,
          "relations": [
            "vault"
          ]
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "solCollateral",
          "type": "u64"
        },
        {
          "name": "usdcBorrow",
          "type": "u64"
        }
      ]
    },
    {
      "name": "rebalanceYield",
      "discriminator": [
        245,
        219,
        143,
        40,
        87,
        236,
        33,
        224
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true,
          "relations": [
            "vault"
          ]
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "repayInstallment",
      "discriminator": [
        113,
        130,
        233,
        104,
        65,
        2,
        233,
        21
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true,
          "relations": [
            "vault"
          ]
        },
        {
          "name": "vault",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          },
          "relations": [
            "loan"
          ]
        },
        {
          "name": "loan",
          "writable": true
        },
        {
          "name": "usdcMint",
          "docs": [
            "USDC mint — required for transfer_checked"
          ]
        },
        {
          "name": "userUsdcAta",
          "docs": [
            "User's USDC ATA (source of repayment)"
          ],
          "writable": true
        },
        {
          "name": "bankPoolUsdcAta",
          "docs": [
            "BankPool USDC ATA (destination)"
          ],
          "writable": true
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": [
        {
          "name": "installmentIndex",
          "type": "u8"
        }
      ]
    },
    {
      "name": "updateScore",
      "discriminator": [
        188,
        226,
        238,
        41,
        14,
        241,
        105,
        215
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true,
          "relations": [
            "vault"
          ]
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "newScore",
          "type": "u16"
        }
      ]
    },
    {
      "name": "withdraw",
      "discriminator": [
        183,
        18,
        70,
        156,
        148,
        109,
        161,
        34
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true,
          "relations": [
            "vault"
          ]
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "bankPool",
      "discriminator": [
        33,
        23,
        184,
        196,
        251,
        217,
        129,
        253
      ]
    },
    {
      "name": "loanAccountTraditional",
      "discriminator": [
        55,
        232,
        19,
        218,
        101,
        224,
        148,
        248
      ]
    },
    {
      "name": "userVault",
      "discriminator": [
        23,
        76,
        96,
        159,
        210,
        10,
        5,
        22
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "vaultAlreadyExists",
      "msg": "Vault already initialized for this wallet"
    },
    {
      "code": 6001,
      "name": "insufficientUsdc",
      "msg": "Insufficient USDC balance in vault"
    },
    {
      "code": 6002,
      "name": "insufficientSol",
      "msg": "Insufficient SOL balance in vault"
    },
    {
      "code": 6003,
      "name": "maxLoansReached",
      "msg": "Maximum active loans reached (3)"
    },
    {
      "code": 6004,
      "name": "tierNotEligible",
      "msg": "Score tier D is not eligible for traditional credit"
    },
    {
      "code": 6005,
      "name": "loanBelowMinimum",
      "msg": "Loan amount below minimum ($50 USDC)"
    },
    {
      "code": 6006,
      "name": "loanExceedsLimit",
      "msg": "Loan amount exceeds approved limit"
    },
    {
      "code": 6007,
      "name": "tooManyInstallments",
      "msg": "Installment array exceeds maximum length (12)"
    },
    {
      "code": 6008,
      "name": "noInstallments",
      "msg": "Installment array must not be empty"
    },
    {
      "code": 6009,
      "name": "installmentAlreadyPaid",
      "msg": "Installment already paid"
    },
    {
      "code": 6010,
      "name": "invalidInstallmentIndex",
      "msg": "Installment index out of bounds"
    },
    {
      "code": 6011,
      "name": "insufficientCollateral",
      "msg": "Insufficient free USDC in vault for collateral"
    },
    {
      "code": 6012,
      "name": "collateralTooLow",
      "msg": "Collateral amount too low for requested borrow"
    },
    {
      "code": 6013,
      "name": "priceUnavailable",
      "msg": "Pyth price feed unavailable"
    },
    {
      "code": 6014,
      "name": "notLiquidatable",
      "msg": "Loan is not eligible for liquidation"
    },
    {
      "code": 6015,
      "name": "loanNotActive",
      "msg": "Loan is not in Active status"
    },
    {
      "code": 6016,
      "name": "unauthorized",
      "msg": "Unauthorized: signer is not the vault owner"
    },
    {
      "code": 6017,
      "name": "poolInsufficientLiquidity",
      "msg": "Bank pool has insufficient liquidity"
    },
    {
      "code": 6018,
      "name": "overflow",
      "msg": "Arithmetic overflow"
    },
    {
      "code": 6019,
      "name": "zeroDeposit",
      "msg": "Deposit amount must be greater than zero"
    }
  ],
  "types": [
    {
      "name": "bankPool",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "usdcAvailable",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "installment",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "dueTs",
            "type": "i64"
          },
          {
            "name": "amountUsdc",
            "type": "u64"
          },
          {
            "name": "paid",
            "type": "bool"
          },
          {
            "name": "paidTs",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "installmentInput",
      "docs": [
        "Input type passed from the score engine via the frontend"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "dueTs",
            "type": "i64"
          },
          {
            "name": "amountUsdc",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "loanAccountTraditional",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "loanId",
            "type": "u8"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "principal",
            "type": "u64"
          },
          {
            "name": "fixedRateBps",
            "type": "u16"
          },
          {
            "name": "collateralUsdcLocked",
            "type": "u64"
          },
          {
            "name": "hybridDefiPct",
            "type": "u8"
          },
          {
            "name": "hybridTradPct",
            "type": "u8"
          },
          {
            "name": "defiRateBps",
            "type": "u16"
          },
          {
            "name": "tradRateBps",
            "type": "u16"
          },
          {
            "name": "nInstallments",
            "type": "u8"
          },
          {
            "name": "paidCount",
            "type": "u8"
          },
          {
            "name": "installments",
            "type": {
              "vec": {
                "defined": {
                  "name": "installment"
                }
              }
            }
          },
          {
            "name": "scoreTier",
            "type": {
              "defined": {
                "name": "scoreTier"
              }
            }
          },
          {
            "name": "disbursedAt",
            "type": "i64"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "loanStatus"
              }
            }
          }
        ]
      }
    },
    {
      "name": "loanStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "active"
          },
          {
            "name": "paid"
          },
          {
            "name": "liquidated"
          },
          {
            "name": "defaulted"
          }
        ]
      }
    },
    {
      "name": "scoreTier",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "a"
          },
          {
            "name": "b"
          },
          {
            "name": "c"
          },
          {
            "name": "d"
          }
        ]
      }
    },
    {
      "name": "userVault",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "score",
            "type": "u16"
          },
          {
            "name": "scoreTier",
            "type": {
              "defined": {
                "name": "scoreTier"
              }
            }
          },
          {
            "name": "usdcDeposited",
            "type": "u64"
          },
          {
            "name": "usdcLocked",
            "type": "u64"
          },
          {
            "name": "solDeposited",
            "type": "u64"
          },
          {
            "name": "solLocked",
            "type": "u64"
          },
          {
            "name": "kaminoShares",
            "type": "u64"
          },
          {
            "name": "msolShares",
            "type": "u64"
          },
          {
            "name": "activeLoans",
            "type": "u8"
          },
          {
            "name": "createdAt",
            "type": "i64"
          },
          {
            "name": "lastScoreUpdate",
            "type": "i64"
          }
        ]
      }
    }
  ]
};
