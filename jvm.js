(function(global) {
    global.JVM = function JVM() {
        this.ClassLoader = new JavaClassLoader(this);
        
        Object.defineProperty(this, '$count', {
            writable: true,
            value: Math.floor(Math.random()*9007199254740992 - 9007199254740992/2)
        })
    };
    JVM.BuiltInClasses = {}
    JVM.RegisterBuiltIn = function(type, impl) {
        if(JVM.settings.verbose)    
            console.log("Registering Built-In-Class", type, impl);
        JVM.BuiltInClasses[type] = impl;
    };
    JVM.prototype.createJumper = function(RET) {
        var jumper = [];
        var pos = -1;
        jumper.start = function(target) {
            if(pos > -1)
                return;
            jumper.next(target);
        };
        jumper.jump = function(to, target) {
            pos = to-1;
            jumper.next(target);
            throw new RET();
        }
        jumper.next = function(target) {
            pos ++;
            if(pos >= jumper.length)
                return;
            jumper[pos].call(target);
        };
        
        return jumper;
    }
    JVM.prototype.makeCurrent = function() {
        global.$currentJVM = this;
    };
    JVM.prototype.newObject = function() {
        var obj = new Object();
        Object.defineProperties(obj, {
            '$jvm': {
                value: this
            },
            '$prop': {
                value: {}
            },
            '$vcache': {
                value: {}
            },
            '$native': {
                value: {}
            },
            '$id': {
                value: this.$count++
            }
        });
        return obj;
    };
    JVM.prototype.initializeObject = function(type, jclass) {
        var object = this.newObject();
        var jclass = jclass || this.ClassLoader.loadClassImpl(type);
        jclass.$impl['_'].apply(object, []);
        return object;
    };
    JVM.prototype.createObject = function(type) {
        var jclass = this.ClassLoader.loadClassImpl(type);
        var object = this.initializeObject(type, jclass);
        jclass.$impl['<init>$()V'].call(object);
        
        return object;
    };
    
    JVM.prototype.dumpStack = function(STACK) {
        var stack = "";
        STACK.forEach(function(frame) {
            if(stack)
                stack += ", ";
            try {
                if(frame === undefined || frame === null)
                    stack += "null";
                else if(frame === window)
                    stack += "global";
                else if(frame instanceof Object && "$class" in frame)
                    stack += JSON.stringify(frame.$prop._value||frame.$prop._buffer||frame.$prop) + " (" + frame.$class.$className + ")";
                else
                    stack += JSON.stringify(frame) + " " + JSON.stringify(Object.getOwnPropertyNames(frame)) + " (" + typeof frame + ")";
            } catch(e) {
                stack += e.toString();
            }
        });
        return stack;
    };
    
    JVM.prototype.createString = function(value) {
        var string = this.initializeObject("java/lang/String");
        Object.defineProperty(string.$prop, "_value", {
            value: value
        });
        return string;
    };
    
    var nullError = / of undefined$/;
    JVM.prototype.convertError = function(e) {
        try {
            if(!e)
                e = new NullPointerException("A error was thrown somewhere. Unfortunitally this means an inaccurate stacktrace.");
            else if(!(e instanceof Error))
                return e;

            var type;
            if("jclass" in e)
                type = e.jclass;
            else if(nullError.test(e.message))
                type = "java/lang/NullPointerException"
            else
                type = "java/lang/RuntimeException"

            var error = this.initializeObject(type);
            Error.call(error);
            this.Object.call(error);
            
            if(e.stack) {
                Object.defineProperty(error.$prop, "_stack", {
                    value: error.$class.$className + ": " + java_process_stack(e.stack)
                });
                Object.defineProperty(error, "stack", {
                    value: e.stack
                });
            }
            Object.defineProperty(error.$prop, "_message", {
                value: e.message
            });
            
            return error;
        } catch(ee) {
            //console.log(ee.stack||ee);
            return e;
        }
    };
    
    JVM.prototype.main = function(classname, args) {
        var start = Date.now();
        this.makeCurrent();
        
        try {
            var mainImpl = this.ClassLoader.loadClassImpl(classname);
        } catch(e) {
            console.warn("An error occured while loading the main class");
            java_printstacktrace(this.convertError(e));
            return;
        }
        
        if(args)
            args = java_constrain_array(JVM.Types.STRING, args);
        else
            args = [];
        
        console.log("Took " + (Date.now()-start) + "ms to initialize and load main class and dependencies.");
        if(JVM.settings.verbose)
            console.dir(mainImpl);
        start = Date.now();
        
        
        if("main$([Ljava/lang/String;)V" in mainImpl.$impl) {
            try {
                mainImpl.$method('main$([Ljava/lang/String;)V')(args);
            } catch(e) {
                console.warn("An error occured while running the main method");
                java_printstacktrace(this.convertError(e));
            } finally {
                console.log("Main exited after " + (Date.now()-start) + "ms");
            }
            
        } else
            throw new JavaErrors.VirtualMachineError(classname.replace(/\//g, '.') + " has no entry point, `public static void main(java.lang.String[] args)` required.", "java/lang/UnsupportedOperationException");
    };
})(this);