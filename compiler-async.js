(function(JVM) {
  var BLOCK_TRY = 0, BLOCK_LABEL = 1;
  JVM.CompileMethod = function(section, $data, impl) {
    var isStatic = section.access.indexOf(JVM.Flags.STATIC) != -1;
    var id = section.name + "$" + section.signature;
    var methodID = $data.classID + "." + section.name;
    var friendlyID = $data.friendlyName + "_$$_" + id.replace(/[^\w$]/g, "_");
    var source = "//@ sourceURL=" + methodID;
    source += "\n\nvar $ = this;";
    var bodysource = "function " + friendlyID + "() {", initSource = "";

    var isNative = true;
    try {
      if(section.implementation instanceof Array)
        isNative = false;
    } catch(e) {}

    if(isNative) {
      if(!$data.$native) {
        Object.defineProperty(impl, "$native", {
          value: $data.$native = {}
        });
        Object.defineProperty(impl, "$nativeData", {
          value: $data.$nativeData = {}
        });
      }

      var native = $data.nativeClasses[name];
      $data.$native[id] = (native && native[id]) || function() {
        var native = $data.nativeClasses[name];
        if(native && native[id]) {
          $data.$native[id] = native[id];
          return native[id].apply(this, arguments);
        }

        if(!native)
          console.error("Native class no registered", native);
        else
          console.error("Cannot find ", id, "in", native);
        throw new JavaErrors.UnsatisfiedLinkError($data.classID + "." + id);
      };

      source += "\nvar impl = $.native['" + id + "'];";
      source += "\nvar helper = {'jvm': $.jvm, 'shared': $.nativeData, 'classloader': $.classloader, 'impl': $.impl};";
      bodysource += "\n\treturn impl.call(this, helper";
      for(var i=0; i<section.sigparts.args.length; i++) {
        bodysource += ", arguments[" + i + "]";
      }
      bodysource += ");"
    } else {
      var crash = false;
      
    }
    bodysource += "\n}";

    source += "\n([";
    if(initSource)
      source += initSource;
    else
      source += "null";
    source += ",";
    source += bodysource;
    source += "])";

    if(JVM.settings.dumpSource)
      console.log("Compiled source `" + source + "`");
    if(crash)// || methodID == "webtest.WebTest.b.run")
      throw new Error();

    var helper = {
      jvm: $data.self.$jvm,
      classloader: $data.self,

      impl: $data.$impl,
      prop: $data.$prop,
      native: $data.$native,
      nativeData: $data.$nativeData,

      error: JavaErrors
    };
    var func = (function source_eval_helper() {
      //console.trace("Compiling source");
      try {
        return eval(source);
      } catch(e) {
        console.error("Failed to compile", source);
        console.log(e.message, e.stack);

        throw e;
      }
    }).call(helper);

    if(func[0]) {
      var init = func[0];
      $data.inits.push(function() {
        try {
          init();
        } catch(e) {
          e = $data.self.$jvm.convertError(e);
          java_printstacktrace(e);

          $self.$impl[id] = function() {
            throw e;
          }
        }
      });
    }
    func = func[1];
    Object.defineProperty(func, "$flags", {
      value: section.access
    });

    if(section.name == "<clinit>")
      $data.inits.push(func);

    if(section.access.indexOf(JVM.Flags.PRIVATE) != -1 || section.access.indexOf(JVM.Flags.PROTECTED) != -1)
      func = java_notpublic_wrap(func);
    if(section.access.indexOf(JVM.Flags.STATIC) != -1)
      func = java_static_wrap(func);
    func = $data.$impl[id] = func;

    //if(section.access.indexOf(JVM.Flags.PUBLIC) != -1)
    //    $publicImpl[id] = func;


    func.toString = function() {
      return methodID;
    };
  }
})(JVM);
