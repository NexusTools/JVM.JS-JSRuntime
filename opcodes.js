(function(JVM) {
    JVM.Opcodes = {
        NOP: 0,

        ACONST_NULL: 1,

        ICONST_M1: 2,
        ICONST_0: 3,
        ICONST_1: 4,
        ICONST_2: 5,
        ICONST_3: 6,
        ICONST_4: 7,
        ICONST_5: 8,

        LCONST_0: 9,
        LCONST_1: 10,

        FCONST_0: 11,
        FCONST_1: 12,
        FCONST_2: 13,

        DCONST_0: 14,
        DCONST_1: 15,

        BIPUSH: 16,
        SIPUSH: 17,

        ILOAD: 21,
        LLOAD: 22,
        FLOAD: 23,
        DLOAD: 24,
        ALOAD: 25,

        LSTORE: 55,

        IASTORE: 79,
        LASTORE: 80,
        FASTORE: 81,
        DASTORE: 82,
        AASTORE: 83,
        BASTORE: 84,
        CASTORE: 85,
        SASTORE: 86,

        POP: 87,

        DUP: 89,
        DUP_X1: 90,
        DUP_X2: 91,
        DUP2: 92,
        DUP2_X1: 93,
        DUP2_X2: 94,

        IADD: 96,
        LADD: 97,
        FADD: 98,
        DADD: 99,

        ISUB: 100,
        LSUB: 101,
        FSUB: 102,
        DSUB: 103,

        IMUL: 104,
        LMUL: 105,
        FMUL: 106,
        DMUL: 107,

        IDIV: 108,
        LDIV: 109,
        FDIV: 110,
        DDIV: 111,

        IREM: 112,
        LREM: 113,
        FREM: 114,
        DREM: 115,

        I2L: 133,
        I2F: 134,
        I2D: 135,
        L2I: 136,
        L2F: 137,
        L2D: 138,
        F2I: 139,
        F2L: 140,
        F2D: 141,
        D2I: 142,
        D2L: 143,
        D2F: 144,
        I2B: 145,
        I2C: 146,
        I2S: 147,

        FCMPL: 149,
        FCMPG: 150,
        DCMPL: 151,
        DCMPG: 152,

        IFEQ: 153,
        IFNE: 154,
        IFLT: 155,
        IFGE: 156,
        IFGT: 157,
        IFLE: 158,

        IF_ICMPEQ: 159,
        IF_ICMPNE: 160,
        IF_ICMPLT: 161,
        IF_ICMPGE: 162,
        IF_ICMPGT: 163,
        IF_ICMPLE: 164,
        IF_ACMPEQ: 165,
        IF_ACMPNE: 166,
        GOTO: 167,

        IRETURN: 172,
        LRETURN: 173,
        FRETURN: 174,
        DRETURN: 175,
        ARETURN: 176,
        RETURN: 177,

        GETSTATIC: 178,
        PUTSTATIC: 179,
        GETFIELD: 180,
        PUTFIELD: 181,

        INVOKEVIRTUAL: 182,
        INVOKESPECIAL: 183,
        INVOKESTATIC: 184,
        INVOKEINTERFACE: 185,
        INVOKEDYNAMIC: 186,

        NEW: 187,
        NEWARRAY: 188,
        ANEWARRAY: 189,

        ATHROW: 191,
        CHECKCAST: 192,


        INVOKESTATICREF: 0x01ff,
        INVOKESPECIALREF: 0x02ff,

        GETALOAD: 0x10ff,
        PUTALOAD: 0x11ff,

        GETSTATICREF: 0x15ff,
        PUTSTATICREF: 0x16ff
    };
})(JVM);
