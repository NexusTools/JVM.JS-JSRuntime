(function(JVM) {
    // TODO: Instead of just constraining, wrap the variables to simulate memory
    function _java_constrain(min, max, val) {
        return Math.min(max, Math.max(min, val));
    }

    function JavaPrimitiveType(sig, type, index, constrain) {
        this.sig = sig;
        this.type = type;
        this.index = index;
        this.constrain = constrain;
    };
    JavaPrimitiveType.prototype.toString = function() {
        return this.type + " " + this.sig + "";
    };
    // TODO: Do non floating primitives floor or ceil...? I'd assume floor...
    JVM.Types = {
        PRIMITIVE: JavaPrimitiveType,

        BOOLEAN: new JavaPrimitiveType("Z", "boolean", 0, function jboolean_constraint(val) {
            return !!val;
        }),
        BYTE: new JavaPrimitiveType("B", "byte", 1, function jbyte_constraint(val) {
            return Math.floor(_java_constrain(-128, 127, val));
        }),
        CHAR: new JavaPrimitiveType("C", "char", 2, function jchar_constraint(val) {
            return Math.floor(_java_constrain(0, 0xFFFF, val));
        }),
        SHORT: new JavaPrimitiveType("S", "short", 3, function jshort_constraint(val) {
            return Math.floor(_java_constrain(-32768, 32767, val));
        }),
        INT: new JavaPrimitiveType("I", "int", 4, function jint_constraint(val) {
            return Math.floor(_java_constrain(-2147483648, 2147483647, val));
        }),
        LONG: new JavaPrimitiveType("J", "long", 5, function jlong_constraint(val) {
            return Math.floor(val); // TODO: Try and properly constrain this as some software might want it to wrap
        }),
        FLOAT: new JavaPrimitiveType("F", "float", 6, function jfloat_constraint(val) {
            return val; // TODO: Try and properly constrain this as some software might want it to wrap
        }),
        DOUBLE: new JavaPrimitiveType("D", "double", 7, function jdouble_constraint(val) {
            return val; // TODO: Try and properly constrain this as some software might want it to wrap
        }),
        STRING: new JavaPrimitiveType("Ljava.lang.String;", "String", 8, function jstring_constraint(val) {
            return "" + val;
        }),
        VOID: new JavaPrimitiveType("V", "void", function jvoid_constraint() {
            return null;
        })
    };
})(JVM);