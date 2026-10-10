#include "benchmark.hpp"
#include "reference_cv.hpp"
#include "riscv_cv.hpp"

int OutputRows(const NMSOnnxCase& test_case)
    {
        const int64_t rows = static_cast<int64_t>(test_case.num_batches) *
            test_case.num_classes * test_case.max_output_boxes_per_class;
        return rows > 0 ? static_cast<int>(rows) : 1;
    }
    
int main()
{
#ifdef RISCV_BAREMETAL
    // Enable the vector unit before any auto-vectorized loop runs (nexus-am's
    // _start only enables the FPU).
    riscv_enable_vector();
#endif

    const int width = 128;
    const int height = 100;
    const int loop_count = 3;

    printf("Add benchmark: %dx%d, %d iterations\n", width, height, loop_count);


    const NMSOnnxCase& test_case = kNMSOnnxCases[0];
    int64_t* expected = new int64_t[OutputRows(test_case) * 3];
    int64_t* actual = new int64_t[OutputRows(test_case) * 3];


    bool all_correct = true;


    for (int p = 1; p < 2; ++p)
    {

        uint64_t reference_cycles = 0, vectorized_cycles = 0;
        uint64_t reference_instrs = 0, vectorized_instrs = 0;

        for (int i = 0; i < loop_count; ++i)
        {
            Timer timer_reference, timer_vectorized;
        
            timer_reference.Start();
        const int expected_count = ref::NonMaxSuppression(
            test_case.boxes,
            test_case.scores,
            test_case.num_batches,
            test_case.num_classes,
            test_case.spatial_dim,
            test_case.max_output_boxes_per_class,
            test_case.iou_threshold,
            test_case.score_threshold,
            test_case.center_point_box,
            expected);
        timer_reference.Stop();

        timer_vectorized.Start();
        const int actual_count = vec::NonMaxSuppression(
            test_case.boxes,
            test_case.scores,
            test_case.num_batches,
            test_case.num_classes,
            test_case.spatial_dim,
            test_case.max_output_boxes_per_class,
            test_case.iou_threshold,
            test_case.score_threshold,
            test_case.center_point_box,
            actual);
        timer_vectorized.Stop();


            reference_cycles += timer_reference.ElapsedCycles();
            reference_instrs += timer_reference.ElapsedInstructions();

            vectorized_cycles += timer_vectorized.ElapsedCycles();
            vectorized_instrs += timer_vectorized.ElapsedInstructions();

           
        }

        PrintTime(0,
                  reference_cycles / loop_count, vectorized_cycles / loop_count,
                  reference_instrs / loop_count, vectorized_instrs / loop_count);

        if (!all_correct)
        {
            break;
        }
    }

    if (all_correct)
    {
        printf("Output is correct.\n");
        return 0;
    }
    else
    {
        printf("Output is wrong!\n");
        return 1;
    }
}
